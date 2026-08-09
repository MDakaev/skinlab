/**
 * Камера для «распознавания» косметики.
 * Реального распознавания нет: превью настоящее, результат — заглушка из каталога.
 */
import { mockRecognize } from './engine.js';

export function createScanner({ video, canvas, onStatus = () => {}, onResult = () => {} }) {
  let stream = null;
  let busy = false;

  async function start() {
    if (stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      onStatus('error', 'Браузер не поддерживает камеру. Загрузите фото из галереи.');
      return false;
    }
    try {
      onStatus('loading', 'Подключаем камеру…');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      onStatus('ready', 'Наведите камеру на упаковку и держите её в рамке');
      return true;
    } catch (err) {
      const reason =
        err?.name === 'NotAllowedError'
          ? 'Доступ к камере запрещён. Разрешите его в настройках сайта или загрузите фото.'
          : 'Камера недоступна. Можно загрузить фото из галереи.';
      onStatus('error', reason);
      return false;
    }
  }

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  function snapshot() {
    if (!canvas || !video?.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  async function capture() {
    if (busy) return;
    busy = true;
    const frame = snapshot();
    onStatus('scanning', 'Анализируем состав…');
    const result = await mockRecognize();
    onStatus('done', 'Готово. Так выглядит будущий результат распознавания.');
    onResult({ ...result, frame, demo: true });
    busy = false;
  }

  async function fromFile(file) {
    if (!file || busy) return;
    busy = true;
    const frame = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    onStatus('scanning', 'Анализируем фото…');
    const result = await mockRecognize();
    onStatus('done', 'Готово. Так выглядит будущий результат распознавания.');
    onResult({ ...result, frame, demo: true });
    busy = false;
  }

  return { start, stop, capture, fromFile };
}
