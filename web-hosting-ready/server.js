const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001; // Динамический порт для хостинга

// Путь к файлу с данными
const DATA_FILE = path.join(__dirname, 'data.json'); // Упрощаем путь для хостинга

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Раздача статических файлов

// Инициализация файла данных, если его нет
if (!fs.existsSync(DATA_FILE)) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify({ appointments: [] }, null, 2));
}

// Функции для работы с данными
const readAppointments = () => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка чтения данных:', error);
    return { appointments: [], doctors: getDefaultDoctors() };
  }
};

const writeAppointments = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Ошибка записи данных:', error);
    return false;
  }
};

// Врачи по умолчанию
const getDefaultDoctors = () => ({
  cardiology: [
    { id: 1, name: 'Др. Алексеева Мария', experience: '15 лет опыта' },
    { id: 2, name: 'Др. Иванов Петр', experience: '12 лет опыта' }
  ],
  neurology: [
    { id: 3, name: 'Др. Смирнова Анна', experience: '18 лет опыта' },
    { id: 4, name: 'Др. Козлов Дмитрий', experience: '10 лет опыта' }
  ],
  therapy: [
    { id: 5, name: 'Др. Петрова Елена', experience: '20 лет опыта' },
    { id: 6, name: 'Др. Сидоров Игорь', experience: '8 лет опыта' }
  ],
  pediatrics: [
    { id: 7, name: 'Др. Новикова Ольга', experience: '14 лет опыта' },
    { id: 8, name: 'Др. Морозов Андрей', experience: '11 лет опыта' }
  ]
});

// API маршруты

// Получить все записи
app.get('/api/appointments', (req, res) => {
  const data = readAppointments();
  res.json(data.appointments);
});

// Получить записи по телефону (для клиента)
app.get('/api/appointments/phone/:phone', (req, res) => {
  const data = readAppointments();
  const userAppointments = data.appointments.filter(
    apt => apt.phone === req.params.phone
  );
  res.json(userAppointments);
});

// Создать новую запись
app.post('/api/appointments', (req, res) => {
  const data = readAppointments();
  
  const newAppointment = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString(),
    status: 'pending' // pending, confirmed, cancelled, completed
  };
  
  data.appointments.push(newAppointment);
  
  if (writeAppointments(data)) {
    console.log('✅ Новая запись создана:', newAppointment.name, '-', newAppointment.doctor);
    res.status(201).json(newAppointment);
  } else {
    res.status(500).json({ error: 'Ошибка сохранения данных' });
  }
});

// Обновить статус записи
app.patch('/api/appointments/:id', (req, res) => {
  const data = readAppointments();
  const index = data.appointments.findIndex(apt => apt.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Запись не найдена' });
  }
  
  data.appointments[index] = {
    ...data.appointments[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  
  if (writeAppointments(data)) {
    console.log('✏️ Запись обновлена:', data.appointments[index].name);
    res.json(data.appointments[index]);
  } else {
    res.status(500).json({ error: 'Ошибка обновления данных' });
  }
});

// Удалить запись
app.delete('/api/appointments/:id', (req, res) => {
  const data = readAppointments();
  const initialLength = data.appointments.length;
  
  data.appointments = data.appointments.filter(apt => apt.id !== req.params.id);
  
  if (data.appointments.length < initialLength) {
    if (writeAppointments(data)) {
      console.log('🗑️ Запись удалена:', req.params.id);
      res.json({ message: 'Запись удалена', id: req.params.id });
    } else {
      res.status(500).json({ error: 'Ошибка удаления данных' });
    }
  } else {
    res.status(404).json({ error: 'Запись не найдена' });
  }
});

// Получить статистику
app.get('/api/stats', (req, res) => {
  const data = readAppointments();
  
  const stats = {
    total: data.appointments.length,
    pending: data.appointments.filter(apt => apt.status === 'pending').length,
    confirmed: data.appointments.filter(apt => apt.status === 'confirmed').length,
    cancelled: data.appointments.filter(apt => apt.status === 'cancelled').length,
    completed: data.appointments.filter(apt => apt.status === 'completed').length,
    bySpecialty: {}
  };
  
  data.appointments.forEach(apt => {
    const specialty = apt.specialtyName || 'Не указано';
    stats.bySpecialty[specialty] = (stats.bySpecialty[specialty] || 0) + 1;
  });
  
  res.json(stats);
});

// Проверка доступности временного слота
app.post('/api/check-availability', (req, res) => {
  const { doctor, date, time } = req.body;
  const data = readAppointments();
  
  const isAvailable = !data.appointments.some(
    apt => apt.doctor === doctor && 
           apt.date === date && 
           apt.time === time &&
           apt.status !== 'cancelled'
  );
  
  res.json({ available: isAvailable });
});

// Получить всех врачей
app.get('/api/doctors', (req, res) => {
  const data = readAppointments();
  const doctors = data.doctors || getDefaultDoctors();
  res.json(doctors);
});

// Добавить врача
app.post('/api/doctors/:specialty', (req, res) => {
  const { specialty } = req.params;
  const { name, experience } = req.body;
  
  if (!name || !experience) {
    return res.status(400).json({ error: 'Не указано имя или опыт врача' });
  }
  
  const data = readAppointments();
  if (!data.doctors) {
    data.doctors = getDefaultDoctors();
  }
  
  if (!data.doctors[specialty]) {
    data.doctors[specialty] = [];
  }
  
  const newId = Math.max(0, ...Object.values(data.doctors).flat().map(d => d.id || 0)) + 1;
  const newDoctor = { id: newId, name, experience };
  
  data.doctors[specialty].push(newDoctor);
  
  if (writeAppointments(data)) {
    console.log('✅ Добавлен врач:', name);
    res.json(newDoctor);
  } else {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

// Обновить врача
app.patch('/api/doctors/:specialty/:id', (req, res) => {
  const { specialty, id } = req.params;
  const { name, experience } = req.body;
  
  const data = readAppointments();
  if (!data.doctors) {
    data.doctors = getDefaultDoctors();
  }
  
  if (!data.doctors[specialty]) {
    return res.status(404).json({ error: 'Специальность не найдена' });
  }
  
  const doctorIndex = data.doctors[specialty].findIndex(d => d.id === parseInt(id));
  if (doctorIndex === -1) {
    return res.status(404).json({ error: 'Врач не найден' });
  }
  
  if (name) data.doctors[specialty][doctorIndex].name = name;
  if (experience) data.doctors[specialty][doctorIndex].experience = experience;
  
  if (writeAppointments(data)) {
    console.log('✏️ Обновлен врач:', data.doctors[specialty][doctorIndex].name);
    res.json(data.doctors[specialty][doctorIndex]);
  } else {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

// Удалить врача
app.delete('/api/doctors/:specialty/:id', (req, res) => {
  const { specialty, id } = req.params;
  
  const data = readAppointments();
  if (!data.doctors) {
    data.doctors = getDefaultDoctors();
  }
  
  if (!data.doctors[specialty]) {
    return res.status(404).json({ error: 'Специальность не найдена' });
  }
  
  const initialLength = data.doctors[specialty].length;
  data.doctors[specialty] = data.doctors[specialty].filter(d => d.id !== parseInt(id));
  
  if (data.doctors[specialty].length < initialLength) {
    if (writeAppointments(data)) {
      console.log('🗑️ Удален врач, ID:', id);
      res.json({ message: 'Врач удален', id });
    } else {
      res.status(500).json({ error: 'Ошибка сохранения' });
    }
  } else {
    res.status(404).json({ error: 'Врач не найден' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('🏥 ========================================');
  console.log('🏥 Сервер записи к врачу запущен!');
  console.log('🏥 ========================================');
  console.log(`📡 API доступен: http://localhost:${PORT}`);
  console.log(`📋 Админ-панель: http://localhost:3000/admin.html`);
  console.log(`👥 Клиентская форма: http://localhost:3000`);
  console.log('🏥 ========================================');
});

module.exports = app;