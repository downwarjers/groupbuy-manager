export const eventBus = {
  emit(event, detail = {}) {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  },
  on(event, callback) {
    window.addEventListener(event, (e) => {
      try {
        callback(e.detail);
      } catch (err) {
        console.error(`[EventBus] 處理事件 ${event} 時崩潰:`, err);
      }
    });
  },
};
