let bluetoothDevice = null;
let controlCharacteristic = null;
let keepAliveInterval = null;
let sensorInterval = null;
let lastWasEmpty = false;

const LEGO_SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';

const statusDiv = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const stopAllBtn = document.getElementById('stopAllBtn');
const motorABtn = document.getElementById('motorABtn');
const motorBBtn = document.getElementById('motorBBtn');
const externalMotorBtn = document.getElementById('externalMotorBtn');
const sensorBtn = document.getElementById('sensorBtn');
const sensorMonitor = document.getElementById('sensorMonitor');

const bricks = {
    red: document.getElementById('brickRed'),
    green: document.getElementById('brickGreen'),
    blue: document.getElementById('brickBlue'),
    cyan: document.getElementById('brickCyan'),
    yellow: document.getElementById('brickYellow'),
    orange: document.getElementById('brickOrange'),
    purple: document.getElementById('brickPurple'),
    white: document.getElementById('brickWhite')
};

connectBtn.addEventListener('click', async () => {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
        onDisconnected();
        return;
    }

    try {
        statusDiv.innerText = "Поиск хаба LEGO...";
        connectBtn.classList.add('connecting');
        connectBtn.style.backgroundColor = "";

        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'LPF2' },
                { namePrefix: 'Move Hub' }
            ],
            optionalServices: [LEGO_SERVICE_UUID]
        });

        if (!bluetoothDevice.name || (!bluetoothDevice.name.includes('LPF2') && !bluetoothDevice.name.includes('Move Hub'))) {
            throw new Error("Выбрано недопустимое устройство!");
        }

        statusDiv.innerText = `Подключение к ${bluetoothDevice.name}...`;
        
        const server = await bluetoothDevice.gatt.connect();
        await new Promise(resolve => setTimeout(resolve, 1000));

        const service = await server.getPrimaryService(LEGO_SERVICE_UUID);
        
        const characteristics = await service.getCharacteristics();
        for (let characteristic of characteristics) {
            if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                controlCharacteristic = characteristic;
                break;
            }
        }

        if (!controlCharacteristic) {
            throw new Error("Не удалось найти рабочий канал связи!");
        }

        try {
            await controlCharacteristic.startNotifications();
            controlCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
        } catch (e) {
            console.log("Уведомления не поддерживаются, но запись доступна.");
        }
        
        statusDiv.innerText = "Статус: Подключено! ✅";
        statusDiv.style.color = "green";
        
        connectBtn.classList.remove('connecting');
        connectBtn.style.backgroundColor = "#81C784";

        setButtonsEnabled(false);

        keepAliveInterval = setInterval(() => {
            sendCommand([0x05, 0x00, 0x02, 0x00]); 
        }, 3000);

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

    } catch (error) {
        console.error(error);
        statusDiv.innerText = "Ошибка: " + error.message;
        statusDiv.style.color = "red";
        onDisconnected();
    }
});

function onDisconnected() {
    statusDiv.innerText = "Статус: Отключено ❌";
    statusDiv.style.color = "#555";
    
    connectBtn.classList.remove('connecting');
    connectBtn.style.backgroundColor = "#ff9800";

    setButtonsEnabled(true);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    if (sensorInterval) clearInterval(sensorInterval);
    controlCharacteristic = null;
    sensorMonitor.innerHTML = "Монитор отключен.";
}

function setButtonsEnabled(disabledState) {
    motorABtn.disabled = disabledState;
    motorBBtn.disabled = disabledState;
    externalMotorBtn.disabled = disabledState;
    sensorBtn.disabled = disabledState;
    stopAllBtn.disabled = disabledState;
    
    Object.values(bricks).forEach(btn => btn.disabled = disabledState);
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

function handleNotifications(event) {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);
    
    if (data.length >= 5 && data[3] === 0x03) {
        const distanceValue = data[4];
        logDistance(distanceValue);
    }
}

function logDistance(val) {
    const isEmpty = (val === 255 || val === 0 || val === undefined);
    const lines = sensorMonitor.getElementsByTagName('div');
    
    if (isEmpty) {
        if (lastWasEmpty) {
            if (lines.length > 0) {
                lines[0].outerHTML = `<div class="empty-blink">empty</div>`;
            }
        } else {
            addMonitorLine("empty", true);
            lastWasEmpty = true;
        }
    } else {
        addMonitorLine(`Расстояние: ${val} см`, false);
        lastWasEmpty = false;
    }
}

function addMonitorLine(text, isBlink) {
    const div = document.createElement('div');
    if (isBlink) {
        div.className = "empty-blink";
    }
    div.innerText = text;
    
    sensorMonitor.insertBefore(div, sensorMonitor.firstChild);
    
    if (sensorMonitor.children.length > 30) {
        sensorMonitor.removeChild(sensorMonitor.lastChild);
    }
}

// --- ИСПРАВЛЕНО: Управление цветами подсветки хаба (порт 0x34 / 52 - встроенный RGB светодиод) ---
// Коды цветов: Красный - 9, Зеленый - 5, Синий - 3, Голубой - 4, Желтый - 7, Оранжевый - 8, Фиолетовый - 2, Белый - 10
bricks.red.addEventListener('click',    () => sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x09]));
bricks.green.addEventListener('click',  () => sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x05]));
bricks.blue.addEventListener('click',   () => sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x03]));
bricks.cyan.addEventListener('click',   () => sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x04]));
bricks.yellow.addEventListener('click', () => sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x07]));
bricks.orange.addEventListener('click', () => sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x08]));
bricks.purple.addEventListener('click', () => sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x02]));
bricks.white.addEventListener('click',  () => sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x0A]));

// Моторы и датчики
motorABtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 50]);
});

motorBBtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x01, 0x11, 0x51, 0x00, 50]);
});

externalMotorBtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x02, 0x11, 0x51, 0x00, 60]);
});

sensorBtn.addEventListener('click', () => {
    const initCmd = [0x0A, 0x00, 0x41, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01];
    sendCommand(initCmd);
    
    sensorMonitor.innerHTML = "Запуск опросчика датчика...<br>";
    
    if (sensorInterval) clearInterval(sensorInterval);
    
    sensorInterval = setInterval(() => {
        const readCmd = [0x05, 0x00, 0x21, 0x03];
        sendCommand(readCmd);
    }, 500);
});

// --- ИСПРАВЛЕНО: Кнопка STOP (Принудительный сброс питания для портов 0, 1, 2) ---
stopAllBtn.addEventListener('click', () => {
    // Отправляем команду принудительной остановки (Port Output Command - Write Direct Mode / Off) для каждого порта
    // Порт A (0x00)
    sendCommand([0x0A, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 0x00]);
    // Порт B (0x01)
    sendCommand([0x0A, 0x00, 0x81, 0x01, 0x11, 0x51, 0x00, 0x00]);
    // Внешний порт C (0x02)
    sendCommand([0x0A, 0x00, 0x81, 0x02, 0x11, 0x51, 0x00, 0x00]);

    // Дополнительный сброс через обнуление мощности (Command 0x00)
    sendCommand([0x05, 0x00, 0x00, 0x00]);

    // Останавливаем фоновый таймер опроса датчика расстояния
    if (sensorInterval) {
        clearInterval(sensorInterval);
        sensorInterval = null;
    }
    
    // Выключаем подсветку хаба
    sendCommand([0x08, 0x00, 0x81, 0x34, 0x11, 0x51, 0x00, 0x00]);

    // Запись в монитор
    const div = document.createElement('div');
    div.style.color = "#ff5252";
    div.innerText = "--- ВСЕ ПРОЦЕССЫ ОСТАНОВЛЕНЫ ---";
    sensorMonitor.insertBefore(div, sensorMonitor.firstChild);
});
