export function getMqttConfig() {
  return {
    brokerUrl: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
    topics: ['shed/#', 'kasa/#'],
  };
}
