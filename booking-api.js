(() => {
  const storageKey = 'manufaktura-booking-request';
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
  window.submitBooking = async (url, payload) => {
    if (!url) throw new Error('Отправка заявок пока не настроена.');
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (!pending || pending.fingerprint !== fingerprint) {
      pending = { fingerprint, id: crypto.randomUUID() };
      try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.id },
        body: JSON.stringify(payload), signal: controller.signal
      });
      let result;
      try { result = await response.json(); } catch { throw new Error('Сервер вернул некорректный ответ. Повторите отправку с теми же данными.'); }
      if (!response.ok || result.ok !== true || !Number.isSafeInteger(result.reservation_id) || result.reservation_id <= 0) {
        throw new Error(result.message || 'Не удалось подтвердить отправку заявки.');
      }
      // Retain this key until the user explicitly starts another booking.
      // Reloading/retrying the same form must not create a second reservation.
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        throw new Error('Нет подтверждения отправки. Повторите с теми же данными, чтобы не создать дубль.');
      }
      throw error;
    } finally { clearTimeout(timer); }
  };
  window.resetBookingRequest = () => {
    pending = null;
    try { sessionStorage.removeItem(storageKey); } catch {}
  };
})();
