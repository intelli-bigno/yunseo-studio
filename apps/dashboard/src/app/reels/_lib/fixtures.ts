// 테스트용 v2 프로젝트 조각
import type { Clip, ReelsProjectV2, Track } from "./types";

export const track = (id: string, kind: Track["kind"], extra: Partial<Track> = {}): Track => ({ id, kind, name: id, ...extra });

export const clip = (id: string, trackId: string, start: number, len: number, extra: Partial<Clip> = {}): Clip => ({ id, trackId, start, in: 0, out: len, speed: 1, ...extra });

export const project = (tracks: Track[], clips: Clip[]): ReelsProjectV2 => ({ version: 2, title: "t", canvas: { width: 1080, height: 1920, fps: 30 }, tracks, clips });
