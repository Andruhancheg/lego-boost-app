let bluetoothDevice = null;
let controlCharacteristic = null;

// UUID службы и характеристики LEGO Move Hub
const LEGO_SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const LEGO_CHARACTERISTIC_UUID = '00001524-1212-efde-1623-785feabcd123'; // Исправлено с 1523 на 1524

const statusDiv = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const ledBtn = document.getElementById('ledBtn');
const motorBtn = document.getElementById('motorBtn');
const stopBtn = document.getElementById('stopBtn');

connectBtn.addEventListener('click', async () => {
    try {
        statusDiv.innerText = "Поиск всех устройств...";
        
        // Запрос вообще любых устройств без фильтрации по имени
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [LEGO_SERVICE_UUID] // Обязательно указываем службу LEGO, чтобы получить к ней доступ
        });

        statusDiv.innerText = `Подключение к ${bluetoothDevice.name || "устройству"}...`;
        
        const server = await bluetoothDevice.gatt.connect();
        const service = await server.getPrimaryService(LEGO_SERVICE_UUID);
        controlCharacteristic = await service.getCharacteristic(LEGO_CHARACTERISTIC_UUID);

        await controlCharacteristic.startNotifications();
        
        statusDiv.innerText = "Статус: Подключено! ✅";
        statusDiv.style.color = "green";

        connectBtn.disabled = true;
        ledBtn.disabled = false;
        motorBtn.disabled = false;
        stopBtn.disabled = false;

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

    } catch (error) {
        console.error(error);
        statusDiv.innerText = "Ошибка подключения: " + error;
        statusDiv.style.color = "red";
    }
});

function onDisconnected() {
    statusDiv.innerText = "Статус: Отключено ❌";
    statusDiv.style.color = "#555";
    connectBtn.disabled = false;
    ledBtn.disabled = true;
    motorBtn.disabled = true;
    stopBtn.disabled = true;
}

// Функция отправки байт-команд на хаб LEGO
async function sendCommand(bytes) {
    if (!controlCharacteristic) return;
    const buffer = new Uint8Array(bytes);
    try {
        await controlCharacteristic.writeValue(buffer);
    } catch (error) {
        console.error("Ошибка отправки команды:", error);
    }
}

// 1. Включить подсветку хаба (Зеленый цвет)
// Формат команды LEGO: [Длина, 0x00, Порт (5 - RGB подсветка), Тип, Режим, Значение цвета]
ledBtn.addEventListener('click', () => {
    // Порт 5 - это встроенный светодиод хаба
    // Значение 3 соответсвует зеленому цвету в палитре LEGO
    const cmd = [0x08, 0x00, 0x38, 0x01, 0x02, 0x00, 0x05, 0x03]; 
    sendCommand(cmd);
});

// 2. Запустить мотор на Порту A
// Порт A обычно имеет идентификатор 0x00
motorBtn.addEventListener('click', () => {
    // Команда запуска мотора А на скорость 50%
    const cmd = [0x08, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 50];
    sendCommand(cmd);
});

// 3. Остановить мотор / движение
stopBtn.addEventListener('click', () => {
    const cmd = [0x08, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 0];
    sendCommand(cmd);
});
