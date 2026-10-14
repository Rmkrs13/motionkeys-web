export interface CameraInfo { id: string; label: string }

/// Alle camera's (labels zijn pas beschikbaar nadat de cameratoestemming ooit verleend is).
export async function listCameras(): Promise<CameraInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

export class CameraError extends Error {
  constructor(readonly kind: 'denied' | 'notFound' | 'inUse' | 'other', message: string) {
    super(message);
  }
}

/// Levert camerabeeld in een <video>-element: 640×480, bij voorkeur 60 fps (minder vertraging).
export class Camera {
  private stream: MediaStream | undefined;
  activeDeviceId: string | undefined;

  async start(video: HTMLVideoElement, deviceId: string): Promise<void> {
    this.stop();
    const base: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } };
    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
        });
      } catch (error) {
        // Gekozen camera niet (meer) aangesloten: val terug op de standaardcamera.
        if (deviceId && (error as DOMException).name === 'OverconstrainedError') {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: base });
        } else {
          throw error;
        }
      }
    } catch (error) {
      const name = (error as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', 'Geen toegang tot de camera.');
      if (name === 'NotFoundError') throw new CameraError('notFound', 'Geen camera gevonden.');
      if (name === 'NotReadableError' || name === 'AbortError') throw new CameraError('inUse', 'Camera kan niet gebruikt worden (in gebruik door een ander programma?).');
      throw new CameraError('other', (error as Error).message ?? 'Camera kan niet gestart worden.');
    }
    this.activeDeviceId = this.stream.getVideoTracks()[0]?.getSettings().deviceId;
    video.srcObject = this.stream;
    await video.play();
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.activeDeviceId = undefined;
  }

  get settings(): MediaTrackSettings | undefined {
    return this.stream?.getVideoTracks()[0]?.getSettings();
  }
}
