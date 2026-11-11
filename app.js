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
        statusDiv.innerText = "Поиск хаба LEGO...";
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'LPF2' },
                { namePrefix: 'Move Hub' }
            ],
            optionalServices: [LEGO_SERVICE_UUID]
        });

        // Дополнительная защита: проверяем, что устройство действительно имеет корректное имя
        if (!bluetoothDevice.name || (!bluetoothDevice.name.includes('LPF2') && !bluetoothDevice.name.includes('Move Hub'))) {
            throw new Error("Выбрано недопустимое устройство (возможно, фантомный адрес из нулей). Выберите настоящий хаб LEGO!");
        }

        statusDiv.innerText = `Подключение к ${bluetoothDevice.name}...`;
        
        const server = await bluetoothDevice.gatt.connect();
        
        const services = await server.getPrimaryServices();
        let legoService = null;
        
        for (let service of services) {
            if (service.uuid.toLowerCase() === LEGO_SERVICE_UUID.toLowerCase()) {
                legoService = service;
                break;
            }
        }
        
        if (!legoService) {
            throw new Error("Служба LEGO не найдена на устройстве!");
        }

        controlCharacteristic = await legoService.getCharacteristic(LEGO_CHARACTERISTIC_UUID);
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
        statusDiv.innerText = "Ошибка: " + error.message;
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
