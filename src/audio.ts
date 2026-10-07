import type { Project } from "./model";

// One clip interval is shared by preview playback, mouth motion and export.
export function audioClips(project: Project) {
  return project.scenes.flatMap((scene) =>
    scene.layers.flatMap((layer) => {
      if (layer.type !== "audio" || !layer.visible || layer.props.volume === 0)
        return [];
      const asset = project.assets.find(
        (a) => a.id === layer.props.assetId && a.type === "audio",
      );
      if (!asset) return [];
      const start = scene.start + layer.start;
      const duration = Math.min(
        layer.duration,
        scene.duration - layer.start,
        project.settings.durationSec - start,
        (asset.durationSec ?? layer.duration) - layer.props.audioOffset,
      );
      return duration > 0 ? [{ layer, asset, start, duration }] : [];
    }),
  );
}

export function mouthOpeningAt(project: Project, actor: string, time: number) {
  if (!actor) return 0;
  let opening = 0;
  for (const clip of audioClips(project)) {
    if (
      clip.layer.props.actor !== actor ||
      time < clip.start ||
      time >= clip.start + clip.duration
    )
      continue;
    const samples = clip.asset.envelope;
    if (!samples?.length) continue;
    const position =
      (time - clip.start + clip.layer.props.audioOffset) *
      (clip.asset.envelopeRate ?? 60);
    const index = Math.floor(position),
      fraction = position - index;
    const energy =
      (samples[index] ?? 0) * (1 - fraction) +
      (samples[index + 1] ?? 0) * fraction;
    opening = Math.max(
      opening,
      Math.min(
        1,
        Math.max(0, (energy - 0.045) * 1.4) * clip.layer.props.volume,
      ),
    );
  }
  return opening;
}

export class AudioPlayer {
  private context: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private lastTime = -1;
  private lastProject: Project | null = null;
  private lastBuffers: Map<string, AudioBuffer> | null = null;
  private started = false;
  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.sources = [];
    this.started = false;
  }
  sync(
    project: Project,
    buffers: Map<string, AudioBuffer>,
    time: number,
    playing: boolean,
  ) {
    if (!playing || !buffers.size) {
      this.stop();
      this.lastTime = time;
      return;
    }
    const changed =
      !this.started ||
      project !== this.lastProject ||
      buffers !== this.lastBuffers ||
      time < this.lastTime - 0.05 ||
      time > this.lastTime + 0.3;
    this.lastTime = time;
    if (!changed) return;
    this.stop();
    const ctx = (this.context ??= new AudioContext());
    void ctx.resume().catch(() => {});
    this.lastProject = project;
    this.lastBuffers = buffers;
    this.started = true;
    for (const clip of audioClips(project)) {
      const buffer = buffers.get(clip.asset.id);
      if (!buffer || time >= clip.start + clip.duration) continue;
      const elapsed = Math.max(0, time - clip.start);
      const offset = clip.layer.props.audioOffset + elapsed;
      const duration = Math.min(
        clip.duration - elapsed,
        buffer.duration - offset,
      );
      if (duration <= 0) continue;
      const source = ctx.createBufferSource(),
        gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = clip.layer.props.volume;
      source.connect(gain).connect(ctx.destination);
      source.start(
        ctx.currentTime + Math.max(0, clip.start - time),
        offset,
        duration,
      );
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      this.sources.push(source);
    }
  }
  dispose() {
    this.stop();
    void this.context?.close();
    this.context = null;
  }
}
