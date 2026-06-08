#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <math.h> 

const String NOME_DO_NODE = "Node 3"; //Nome do Node
const String CARTEIRA_DONO = "0x4C87D17e7A210D9c659e8dA0E358855b410C412a"; //Endereço da sua carteira

const char* ssid = "SEU_SSID_WIFI"; //Seu login da rede Wi-Fi
const char* password = "SUA_SENHA_WIFI"; //Sua senha da rede Wi-Fi
const char* serverUrl = "http://192.168.0.4:3000/registrar-dados"; //Alterar pelo o IP do seu computador

#define MQ135_PIN 34
#define DHT_PIN 4
#define DHT_TYPE DHT11
#define RXD2 16 
#define TXD2 17 

// --- PARÂMETROS DE CALIBRAÇÃO DO MQ-135 ---
const float RL_VALOR = 1.0;           
const float RO_CLEAN_AIR_FACTOR = 3.6; 
float R0 = 10.0;                      

DHT dht(DHT_PIN, DHT_TYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

// Função matemática para calcular RS
float calcularRs(int adcBruto) {
  if (adcBruto == 0) return 0;
  float tensao = ((float)adcBruto / 4095.0) * 3.3;
  float rs = ((3.3 - tensao) * RL_VALOR) / tensao;
  return rs;
}

// Função para calcular o PPM real de CO2
int obterPPMCO2(float rs) {
  if (R0 == 0) return 400;
  float razao = rs / R0;
  
  float a = 110.47;
  float b = -2.862;
  
  float ppm = a * pow(razao, b);
  return (int)(ppm + 400);
}

// Função para estimar o AQI aproximado
int obterAQIEstimado(float rs) {
  if (R0 == 0) return 0;
  float razao = rs / R0;
  
  int aqi = (int)(100.0 * pow(razao, -1.5));
  if (aqi > 500) aqi = 500;
  return aqi;
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  gpsSerial.begin(9600, SERIAL_8N1, RXD2, TXD2); 
  
  WiFi.begin(ssid, password);
  Serial.print("Conectando ao WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(1000); Serial.print("."); }
  Serial.println("\nConectado!");

  Serial.println("Calibrando MQ-135 em ar limpo (Aguarde)...");
  long somaAdc = 0;
  for (int i = 0; i < 50; i++) {
    somaAdc += analogRead(MQ135_PIN);
    delay(100);
  }
  float mediaAdc = (float)somaAdc / 50.0;
  float rsArLimpo = calcularRs(mediaAdc);
  R0 = rsArLimpo / RO_CLEAN_AIR_FACTOR;
  
  Serial.print("Calibração concluída. R0 calculado: ");
  Serial.print(R0);
  Serial.println(" kOhm");
}

void loop() {
  // Alimenta constantemente o objeto de parseamento do GPS com os dados serias do módulo
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  static unsigned long ultimaLeitura = 0;
  if (millis() - ultimaLeitura > 60000) { 
    ultimaLeitura = millis();
    Serial.println("\n===================================");
    Serial.println("📡 Coletando dados do " + NOME_DO_NODE);
    Serial.println("===================================");

    int temperatura = dht.readTemperature(); 
    int umidade = dht.readHumidity(); 
    
    // --- FILTRO DE RUÍDO (Oversampling) ---
    long somaAdc = 0;
    int leiturasValidas = 0;
    for (int i = 0; i < 10; i++) {
      int leituraInst = analogRead(MQ135_PIN);
      if (leituraInst > 10 && leituraInst < 4090) { 
        somaAdc += leituraInst;
        leiturasValidas++;
      }
      delay(10);
    }
    
    int leituraBrutaMQ = (leiturasValidas > 0) ? (somaAdc / leiturasValidas) : 1000; 

    // --- CÁLCULO REAL DO SENSOR MQ-135 ---
    float rsAtual = calcularRs(leituraBrutaMQ);
    int co2 = obterPPMCO2(rsAtual);
    int aqi = obterAQIEstimado(rsAtual);

    // --- CAPTURA DE GEOLOCALIZAÇÃO REAL VIA SATÉLITE ---
    String gpsString = "Sem Sinal"; 
    
    if (gps.location.isValid() && gps.location.age() < 5000) {
      // Formata a string combinando Latitude e Longitude com precisão de 6 casas decimais
      gpsString = String(gps.location.lat(), 6) + ":" + String(gps.location.lng(), 6);
    } else {
      Serial.println("⚠️ GPS sem sinal de satélite estável. Enviando marcador de ausência de sinal.");
    }

    if (isnan(temperatura) || isnan(umidade)) {
      Serial.println("❌ Falha ao ler o DHT11!");
    } else {
      
      Serial.println("📍 GPS   : " + gpsString);
      Serial.println("🌡️ Temp  : " + String(temperatura) + " °C");
      Serial.println("💧 Umid  : " + String(umidade) + " %");
      Serial.println("☁️ CO2   : " + String(co2) + " ppm");
      Serial.println("😷 AQI   : " + String(aqi));
      Serial.println("🔌 ADC Bruto MQ135: " + String(leituraBrutaMQ));
      Serial.println("-----------------------------------");

      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(serverUrl);
        http.addHeader("Content-Type", "application/json");

        String jsonPayload = "{";
        jsonPayload += "\"nomeNode\":\"" + NOME_DO_NODE + "\",";
        jsonPayload += "\"carteiraDono\":\"" + CARTEIRA_DONO + "\","; 
        jsonPayload += "\"temperatura\":" + String(temperatura) + ",";
        jsonPayload += "\"umidade\":" + String(umidade) + ",";
        jsonPayload += "\"co2\":" + String(co2) + ",";
        jsonPayload += "\"aqi\":" + String(aqi) + ",";
        jsonPayload += "\"gps\":\"" + gpsString + "\"";
        jsonPayload += "}";

        Serial.println("Box 📦 Empacotando e enviando para o Node.js...");
        
        int httpResponseCode = http.POST(jsonPayload);
        
        if(httpResponseCode > 0) {
          Serial.println("✅ Código HTTP: " + String(httpResponseCode) + " (Sucesso)");
        } else {
          Serial.println("❌ Erro HTTP: " + String(httpResponseCode) + " (Falha na conexão)");
        }
        
        http.end();
      } else {
         Serial.println("❌ WiFi Desconectado!");
      }
    }
  }
}