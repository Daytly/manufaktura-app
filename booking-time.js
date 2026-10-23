(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  function now(instant = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone:'Asia/Barnaul', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
    }).formatToParts(instant).map(p => [p.type,p.value]));
    return new Date(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  }
  function slots(date, current = now()) {
    const previous = new Date(date); previous.setDate(previous.getDate()-1);
    const lastEarly = ([5,6].includes(previous.getDay()) ? 4 : 1) * 60;
    const result = [];
    for (let minute=0; minute<1440; minute+=30) {
      if (minute>lastEarly && minute<17*60) continue;
      const arrival=new Date(date.getFullYear(),date.getMonth(),date.getDate(),Math.floor(minute/60),minute%60);
      if (arrival.getTime() < current.getTime()+30*60000) continue;
      result.push(`${pad(Math.floor(minute/60))}:${pad(minute%60)}`);
    }
    return result;
  }
  const api = {now,key,slots};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.BookingTime=api;
})(globalThis);
