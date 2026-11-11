let bluetoothDevice = null;
let controlCharacteristic = null;
let keepAliveInterval = null;

const LEGO_SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const LEGO_CHARACTERISTIC_UUID = '00001524-1212-efde-1623-785feabcd123';

const statusDiv = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const ledBtn = document.getElementById('ledBtn');
const motorABtn = document.getElementById('motorABtn');
const motorBBtn = document.getElementById('motorBBtn');
const externalMotorBtn = document.getElementById('externalMotorBtn');
const sensorBtn = document.getElementById('sensorBtn');
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

        if (!bluetoothDevice.name || (!bluetoothDevice.name.includes('LPF2') && !bluetoothDevice.name.includes('Move Hub'))) {
            throw new Error("Выбрано недопустимое устройство. Выберите настоящий хаб LEGO!");
        }

        statusDiv.innerText = `Подключение к ${bluetoothDevice.name}...`;
        
        const server = await bluetoothDevice.gatt.connect();
        
        // Пауза 1 секунда для стабилизации соединения и опроса служб хаба
        await new Promise(resolve => setTimeout(resolve, 1000));

        const service = await server.getPrimaryService(LEGO_SERVICE_UUID);
        controlCharacteristic = await service.getCharacteristic(LEGO_CHARACTERISTIC_UUID);

        await controlCharacteristic.startNotifications();
        
        controlCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);

        statusDiv.innerText = "Статус: Подключено! ✅";
        statusDiv.style.color = "green";

        connectBtn.disabled = true;
        setButtonsEnabled(false);

        // Защита от обрыва соединения (пингуем хаб каждые 3 секунды)
        keepAliveInterval = setInterval(() => {
            sendCommand([0x05, 0x00, 0x02, 0x00]); 
        }, 3000);

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
    setButtonsEnabled(true);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
}

function setButtonsEnabled(disabledState) {
    ledBtn.disabled = disabledState;
    motorABtn.disabled = disabledState;
    motorBBtn.disabled = disabledState;
    externalMotorBtn.disabled = disabledState;
    sensorBtn.disabled = disabledState;
    stopBtn.disabled = disabledState;
}

async function sendCommand(bytes) {
    if (!controlCharacteristic) return;
    const buffer = new Uint8Array(bytes);
    try {
        await controlCharacteristic.writeValue(buffer);
    } catch (error) {
        console.error("Ошибка отправки команды:", error);
    }
}

// Обработка данных от датчиков (расстояние и цвет)
function handleNotifications(event) {
    const value = event.target.value;
    console.log("Получены данные от хаба:", new Uint8Array(value.buffer));
}

// 1. Включить подсветку хаба (Зеленый цвет)
ledBtn.addEventListener('click', () => {
    const cmd = [0x08, 0x00, 0x81, 0x32, 0x11, 0x51, 0x01, 0x03];
    sendCommand(cmd);
});

// 2. Мотор А (Встроенный мотор на Move Hub)
motorABtn.addEventListener('click', () => {
    const cmd = [0x08, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 50];
    sendCommand(cmd);
});

// 3. Мотор B (Встроенный мотор на Move Hub)
motorBBtn.addEventListener('click', () => {
    const cmd = [0x08, 0x00, 0x81, 0x01, 0x11, 0x51, 0x00, 50];
    sendCommand(cmd);
});

// 4. Внешний мотор (Порт C)
externalMotorBtn.addEventListener('click', () => {
    const cmd = [0x08, 0x00, 0x81, 0x02, 0x11, 0x51, 0x00, 60];
    sendCommand(cmd);
});

// 5. Запрос данных с датчика цвета и расстояния (Порт D)
sensorBtn.addEventListener('click', () => {
    const cmd = [0x0A, 0x00, 0x41, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01];
    sendCommand(cmd);
    statusDiv.innerText = "Датчик опрошен. Смотрите данные в консоли!";
});

// 6. Стоп всех моторов
stopBtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 0]);
    sendCommand([0x08, 0x00, 0x81, 0x01, 0x11, 0x51, 0x00, 0]);
    sendCommand([0x08, 0x00, 0x81, 0x02, 0x11, 0x51, 0x00, 0]);
});
