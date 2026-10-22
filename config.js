// Настройки бара — реальные данные из профилей Telegram/Instagram (20.10.2026).
window.BAR = {
  name: "Мануфактура",
  tagline: "Бар-кухня в старом доме",
  motto: "Мы не придумываем лишнего",
  about: "Гостеприимство, которое обнимает, и внимательность, которая не пропускает ничего",
  building: "Дом купца А. Г. Морозова",
  phone: "+7 996 501-87-57",
  phoneRaw: "+79965018757",
  city: "Барнаул",
  address: "Льва Толстого, 36",
  hours: [
    { days: "Вс–Чт", time: "17:00–02:00" },
    { days: "Пт–Сб", time: "17:00–05:00" }
  ],
  telegram: "https://t.me/manufactura_bar",
  appLink: "https://t.me/manufacturabar_bot/app",   // ссылка на мини-приложение (демо-бот)
  instagram: "https://instagram.com/manufacturabar",
  map: "https://2gis.ru/barnaul/search/%D0%9B%D1%8C%D0%B2%D0%B0%20%D0%A2%D0%BE%D0%BB%D1%81%D1%82%D0%BE%D0%B3%D0%BE%2C%2036",  // 2ГИС: поиск по адресу в Барнауле (точную карточку бара взять из закрепа канала)
  review2gis: "",     // ссылка «оставить отзыв» в 2ГИС — взять у бара
  reviewYandex: "",   // ссылка на отзыв в Яндекс Картах — взять у бара
  tips: "",           // ссылка на чаевые команде (Нетмонет / CloudTips и т.п.) — взять у бара

  // Подпись автора приложения внизу вкладки «О баре». authorLink — например t.me/username (можно оставить пустым).
  author: "Александр Сахно",
  authorLink: "https://t.me/onkhas",

  // Адрес нашего сервера. Данные доступа ReMarked хранятся только в .env.
  webhookUrl: "/api/bookings"
};

// Public Pages build: backend endpoint, never credentials.
window.BAR.webhookUrl = "";
