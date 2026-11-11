let bluetoothDevice = null;
let controlCharacteristic = null;
let keepAliveInterval = null;
let sensorInterval = null;
let lastWasEmpty = false; // Флаг для отслеживания повторения "empty"

const LEGO_SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';

const statusDiv = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const stopAllBtn = document.getElementById('stopAllBtn');
const ledBtn = document.getElementById('ledBtn');
const motorABtn = document.getElementById('motorABtn');
const motorBBtn = document.getElementById('motorBBtn');
const externalMotorBtn = document.getElementById('externalMotorBtn');
const sensorBtn = document.getElementById('sensorBtn');
const sensorMonitor = document.getElementById('sensorMonitor');

// Управление кнопкой Bluetooth (сопряжение / разрыв)
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
        connectBtn.style.backgroundColor = "#81C784"; // Бледно-зеленый

        setButtonsEnabled(false);

        // Пинг для поддержания соединения
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
    connectBtn.style.backgroundColor = "#ff9800"; // Оранжевый

    setButtonsEnabled(true);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    if (sensorInterval) clearInterval(sensorInterval);
    controlCharacteristic = null;
    sensorMonitor.innerHTML = "Монитор отключен.";
}

function setButtonsEnabled(disabledState) {
    ledBtn.disabled = disabledState;
    motorABtn.disabled = disabledState;
    motorBBtn.disabled = disabledState;
    externalMotorBtn.disabled = disabledState;
    sensorBtn.disabled = disabledState;
    stopAllBtn.disabled = disabledState;
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

// Обработка входящих пакетов от датчиков
function handleNotifications(event) {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);
    
    // Проверяем, пришли ли данные от датчика расстояния (порт 3 / 0x03)
    // В протоколе LEGO Move Hub сырые данные датчика расстояния приходят в конце пакета
    if (data.length >= 5 && data[3] === 0x03) {
        const distanceValue = data[4]; // Значение расстояния
        logDistance(distanceValue);
    }
}

// Функция вывода данных в монитор с логикой "empty"
function logDistance(val) {
    // Если значение датчика равно 255 или 0 (нет объекта / ошибка замера) -> считаем за "empty"
    const isEmpty = (val === 255 || val === 0 || val === undefined);
    
    const lines = sensorMonitor.getElementsByTagName('div');
    
    if (isEmpty) {
        if (lastWasEmpty) {
            // Если предыдущая запись тоже была empty — заменяем её и заставляем мигнуть
            if (lines.length > 0) {
                lines[0].outerHTML = `<div class="empty-blink">empty</div>`;
            }
        } else {
            // Первая неудачная попытка — добавляем новую строчку "empty"
            addMonitorLine("empty", true);
            lastWasEmpty = true;
        }
    } else {
        // Успешный замер
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
    
    // Ограничиваем историю до 20 строк, чтобы монитор не переполнялся
    if (sensorMonitor.children.length > 20) {
        sensorMonitor.removeChild(sensorMonitor.lastChild);
    }
}

// --- Управление устройствами ---

// 1. Подсветка
ledBtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x32, 0x11, 0x51, 0x01, 0x03]);
});

// 2. Мотор А (Порт 0x00)
motorABtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 50]);
});

// 3. Мотор B (Порт 0x01)
motorBBtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x01, 0x11, 0x51, 0x00, 50]);
});

// 4. Внешний мотор (Порт C / 0x02)
externalMotorBtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x02, 0x11, 0x51, 0x00, 60]);
});

// 5. Запуск опроса датчика расстояния (Порт D / 0x03) 2 раза в секунду
sensorBtn.addEventListener('click', () => {
    // Команда активации режима датчика цвета и расстояния (режим 0x00 или 0x01)
    const initCmd = [0x0A, 0x00, 0x41, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01];
    sendCommand(initCmd);
    
    sensorMonitor.innerHTML = "Запуск опросчика датчика...<br>";
    
    if (sensorInterval) clearInterval(sensorInterval);
    
    // Опрос каждые 500 мс (2 раза в секунду)
    sensorInterval = setInterval(() => {
        // Запрос портативного значения (Port Value Read) для порта 3
        const readCmd = [0x05, 0x00, 0x21, 0x03];
        sendCommand(readCmd);
    }, 500);
});

// 6. Кнопка STOP (Остановка всех трех моторов: A, B и внешнего порта C)
stopAllBtn.addEventListener('click', () => {
    // Отправляем нулевую скорость отдельно на каждый порт моторов
    sendCommand([0x08, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 0]); // Мотор A стоп
    sendCommand([0x08, 0x00, 0x81, 0x01, 0x11, 0x51, 0x00, 0]); // Мотор B стоп
    sendCommand([0x08, 0x00, 0x81, 0x02, 0x11, 0x51, 0x00, 0]); // Внешний мотор стоп
    sensorMonitor.insertBefore(document.createTextNode("--- ВСЕ МОТОРЫ ОСТАНОВЛЕНЫ --- \n"), sensorMonitor.firstChild);
});
