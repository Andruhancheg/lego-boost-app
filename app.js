let bluetoothDevice = null;
let controlCharacteristic = null;
let keepAliveInterval = null;

const LEGO_SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';

const statusDiv = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const ledBtn = document.getElementById('ledBtn');
const motorABtn = document.getElementById('motorABtn');
const motorBBtn = document.getElementById('motorBBtn');
const externalMotorBtn = document.getElementById('externalMotorBtn');
const sensorBtn = document.getElementById('sensorBtn');
const stopBtn = document.getElementById('stopBtn');

// Единая кнопка сопряжения и разрыва соединения
connectBtn.addEventListener('click', async () => {
    // Если уже подключены — разрываем соединение
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
        onDisconnected();
        return;
    }

    try {
        statusDiv.innerText = "Поиск хаба LEGO...";
        connectBtn.classList.add('connecting'); // Мигает синим во время поиска
        connectBtn.style.backgroundColor = "";

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
        
        // Пауза 1 секунда для стабилизации соединения
        await new Promise(resolve => setTimeout(resolve, 1000));

        const service = await server.getPrimaryService(LEGO_SERVICE_UUID);
        
        // Автоматический поиск характеристики с поддержкой записи
        const characteristics = await service.getCharacteristics();
        for (let characteristic of characteristics) {
            if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                controlCharacteristic = characteristic;
                break;
            }
        }

        if (!controlCharacteristic) {
            throw new Error("Не удалось найти рабочий канал связи с хабом!");
        }

        try {
            await controlCharacteristic.startNotifications();
            controlCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
        } catch (e) {
            console.log("Уведомления не поддерживаются, но запись доступна.");
        }
        
        statusDiv.innerText = "Статус: Подключено! ✅";
        statusDiv.style.color = "green";
        
        // Успешное соединение: кнопка становится бледно-зеленой
        connectBtn.classList.remove('connecting');
        connectBtn.style.backgroundColor = "#81C784"; // Бледно-зеленый

        setButtonsEnabled(false);

        // Пинг для предотвращения разрыва соединения
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
    
    // При разрыве соединение: кнопка становится оранжевой
    connectBtn.classList.remove('connecting');
    connectBtn.style.backgroundColor = "#ff9800"; // Оранжевый

    setButtonsEnabled(true);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    controlCharacteristic = null;
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

function handleNotifications(event) {
    const value = event.target.value;
    console.log("Данные от хаба:", new Uint8Array(value.buffer));
}

// Управление
ledBtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x32, 0x11, 0x51, 0x01, 0x03]);
});

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
    sendCommand([0x0A, 0x00, 0x41, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01]);
    statusDiv.innerText = "Датчик опрошен!";
});

stopBtn.addEventListener('click', () => {
    sendCommand([0x08, 0x00, 0x81, 0x00, 0x11, 0x51, 0x00, 0]);
    sendCommand([0x08, 0x00, 0x81, 0x01, 0x11, 0x51, 0x00, 0]);
    sendCommand([0x08, 0x00, 0x81, 0x02, 0x11, 0x51, 0x00, 0]);
});
