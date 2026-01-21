const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001; // Динамический порт для хостинга

// Путь к файлу с данными
const DATA_FILE = path.join(__dirname, 'data.json'); // Упрощаем путь для хостинга

// Middleware
app.use(cors({
    origin: '*', // Разрешаем все источники (включая Electron)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Раздача статических файлов


// Явные роуты для PWA
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Инициализация файла данных, если его нет

if (!fs.existsSync(DATA_FILE)) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify({ 
    appointments: [],
    users: [],
    support_tickets: []
  }, null, 2));
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

// ============================================
// API: РЕГИСТРАЦИЯ И АВТОРИЗАЦИЯ
// ============================================

// Регистрация
app.post('/api/register', (req, res) => {
  const { inn, password, name, phone } = req.body;
  
  if (!inn || !password || !name || !phone) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }
  
  if (!/^\d{14}$/.test(inn)) {
    return res.status(400).json({ error: 'ИНН должен содержать 14 цифр' });
  }
  
  const data = readAppointments();
  if (!data.users) data.users = [];
  
  if (data.users.find(u => u.inn === inn)) {
    return res.status(400).json({ error: 'Пользователь с таким ИНН уже существует' });
  }
  
  const newUser = {
    id: Date.now().toString(),
    inn,
    password,
    name,
    phone,
    createdAt: new Date().toISOString()
  };
  
  data.users.push(newUser);
  
  if (writeAppointments(data)) {
    console.log('✅ Зарегистрирован:', name, 'ИНН:', inn);
    res.json({ 
      success: true, 
      user: { id: newUser.id, inn: newUser.inn, name: newUser.name, phone: newUser.phone }
    });
  } else {
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// Вход
app.post('/api/login', (req, res) => {
  const { inn, password } = req.body;
  
  if (!inn || !password) {
    return res.status(400).json({ error: 'ИНН и пароль обязательны' });
  }
  
  const data = readAppointments();
  if (!data.users) data.users = [];
  
  const user = data.users.find(u => u.inn === inn && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Неверный ИНН или пароль' });
  }
  
  console.log('🔑 Вход:', user.name);
  res.json({ 
    success: true, 
    user: { id: user.id, inn: user.inn, name: user.name, phone: user.phone }
  });
});

// Получить пользователя
app.get('/api/user/:inn', (req, res) => {
  const data = readAppointments();
  if (!data.users) data.users = [];
  
  const user = data.users.find(u => u.inn === req.params.inn);
  
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  res.json({ id: user.id, inn: user.inn, name: user.name, phone: user.phone });
});

// Обновить пользователя
app.patch('/api/user/:inn', (req, res) => {
  const { name, phone, newPassword } = req.body;
  const data = readAppointments();
  if (!data.users) data.users = [];
  
  const userIndex = data.users.findIndex(u => u.inn === req.params.inn);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  if (name) data.users[userIndex].name = name;
  if (phone) data.users[userIndex].phone = phone;
  if (newPassword) data.users[userIndex].password = newPassword;
  
  if (writeAppointments(data)) {
    console.log('✏️ Обновлен:', data.users[userIndex].name);
    res.json({ 
      success: true, 
      user: { 
        id: data.users[userIndex].id, 
        inn: data.users[userIndex].inn, 
        name: data.users[userIndex].name, 
        phone: data.users[userIndex].phone 
      }
    });
  } else {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// Получить записи пользователя по userId
app.get('/api/appointments/user/:userId', (req, res) => {
  const data = readAppointments();
  const userAppointments = data.appointments.filter(
    apt => apt.userId === req.params.userId
  );
  res.json(userAppointments);
});

// ============================================
// API: СЛУЖБА ПОДДЕРЖКИ
// ============================================

// Создать обращение
app.post('/api/support', (req, res) => {
  const { userId, userName, subject, message } = req.body;
  
  if (!userId || !subject || !message) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }
  
  const data = readAppointments();
  if (!data.support_tickets) data.support_tickets = [];
  
  const newTicket = {
    id: Date.now().toString(),
    userId,
    userName: userName || 'Пользователь',
    subject,
    messages: [  // Теперь массив сообщений
      {
        id: Date.now().toString(),
        text: message,
        sender: 'user',
        senderName: userName || 'Пользователь',
        createdAt: new Date().toISOString()
      }
    ],
    status: 'new',
    createdAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString()
  };
  
  data.support_tickets.push(newTicket);
  
  if (writeAppointments(data)) {
    console.log('📩 Новое обращение от:', userName || userId);
    res.status(201).json(newTicket);
  } else {
    res.status(500).json({ error: 'Ошибка создания обращения' });
  }
});

// Получить обращения пользователя
app.get('/api/support/user/:userId', (req, res) => {
  const data = readAppointments();
  if (!data.support_tickets) data.support_tickets = [];
  
  const userTickets = data.support_tickets.filter(t => t.userId === req.params.userId);
  res.json(userTickets);
});

// Получить все обращения (админ)
app.get('/api/support', (req, res) => {
  const data = readAppointments();
  if (!data.support_tickets) data.support_tickets = [];
  
  res.json(data.support_tickets);
});

// Добавить сообщение в обращение (работает и для админа и для пользователя)
app.post('/api/support/:id/message', (req, res) => {
  const { message, sender, senderName } = req.body;
  
  if (!message || !sender) {
    return res.status(400).json({ error: 'Сообщение и отправитель обязательны' });
  }
  
  const data = readAppointments();
  if (!data.support_tickets) data.support_tickets = [];
  
  const ticketIndex = data.support_tickets.findIndex(t => t.id === req.params.id);
  
  if (ticketIndex === -1) {
    return res.status(404).json({ error: 'Обращение не найдено' });
  }
  
  const newMessage = {
    id: Date.now().toString(),
    text: message,
    sender: sender, // 'user' или 'admin'
    senderName: senderName || (sender === 'admin' ? 'Администратор' : 'Пользователь'),
    createdAt: new Date().toISOString()
  };
  
  data.support_tickets[ticketIndex].messages.push(newMessage);
  data.support_tickets[ticketIndex].lastMessageAt = new Date().toISOString();
  
  // Обновить статус если админ отвечает
  if (sender === 'admin' && data.support_tickets[ticketIndex].status === 'new') {
    data.support_tickets[ticketIndex].status = 'answered';
  }
  
  if (writeAppointments(data)) {
    console.log('💬 Новое сообщение в обращении:', req.params.id, 'от:', sender);
    res.json(data.support_tickets[ticketIndex]);
  } else {
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

// Старый endpoint для обратной совместимости (можно удалить потом)
app.patch('/api/support/:id/reply', (req, res) => {
  const { adminReply } = req.body;
  
  if (!adminReply) {
    return res.status(400).json({ error: 'Ответ обязателен' });
  }
  
  // Перенаправляем на новый endpoint
  req.body = {
    message: adminReply,
    sender: 'admin',
    senderName: 'Администратор'
  };
  
  // Используем новую логику
  const data = readAppointments();
  if (!data.support_tickets) data.support_tickets = [];
  
  const ticketIndex = data.support_tickets.findIndex(t => t.id === req.params.id);
  
  if (ticketIndex === -1) {
    return res.status(404).json({ error: 'Обращение не найдено' });
  }
  
  const newMessage = {
    id: Date.now().toString(),
    text: adminReply,
    sender: 'admin',
    senderName: 'Администратор',
    createdAt: new Date().toISOString()
  };
  
  // Обратная совместимость - инициализируем messages если их нет
  if (!data.support_tickets[ticketIndex].messages) {
    data.support_tickets[ticketIndex].messages = [
      {
        id: Date.now().toString() + '_old',
        text: data.support_tickets[ticketIndex].message || '',
        sender: 'user',
        senderName: data.support_tickets[ticketIndex].userName,
        createdAt: data.support_tickets[ticketIndex].createdAt
      }
    ];
  }
  
  data.support_tickets[ticketIndex].messages.push(newMessage);
  data.support_tickets[ticketIndex].status = 'answered';
  data.support_tickets[ticketIndex].lastMessageAt = new Date().toISOString();
  
  if (writeAppointments(data)) {
    console.log('💬 Ответ на обращение:', req.params.id);
    res.json(data.support_tickets[ticketIndex]);
  } else {
    res.status(500).json({ error: 'Ошибка отправки ответа' });
  }
});

// Закрыть обращение
app.patch('/api/support/:id/close', (req, res) => {
  const data = readAppointments();
  if (!data.support_tickets) data.support_tickets = [];
  
  const ticketIndex = data.support_tickets.findIndex(t => t.id === req.params.id);
  
  if (ticketIndex === -1) {
    return res.status(404).json({ error: 'Обращение не найдено' });
  }
  
  data.support_tickets[ticketIndex].status = 'closed';
  
  if (writeAppointments(data)) {
    console.log('✅ Обращение закрыто:', req.params.id);
    res.json(data.support_tickets[ticketIndex]);
  } else {
    res.status(500).json({ error: 'Ошибка закрытия обращения' });
  }
});

// Удалить обращение
app.delete('/api/support/:id', (req, res) => {
  const data = readAppointments();
  if (!data.support_tickets) data.support_tickets = [];
  
  const ticketIndex = data.support_tickets.findIndex(t => t.id === req.params.id);
  
  if (ticketIndex === -1) {
    return res.status(404).json({ error: 'Обращение не найдено' });
  }
  
  const deletedTicket = data.support_tickets[ticketIndex];
  data.support_tickets.splice(ticketIndex, 1);
  
  if (writeAppointments(data)) {
    console.log('🗑️ Обращение удалено:', req.params.id);
    res.json({ success: true, deleted: deletedTicket });
  } else {
    res.status(500).json({ error: 'Ошибка удаления обращения' });
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
