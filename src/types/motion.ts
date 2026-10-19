export type CharacterOrientation = 'video' | 'image';

export interface CharacterItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  aspectRatio: string;
  description: string;
  pairedMotionId?: string;
  rhFileName?: string;
}

export interface MotionPreset {
  id: string;
  name: string;
  category: string;
  duration: number; // in seconds
  bpm: number;
  videoUrl: string; // Real playable driving motion video (Node 33)
  previewUrl: string;
  outputVideoUrl: string; // The corresponding generated video result from RunningHub WAN+SCAIL
  description: string;
  motionType: 'dance' | 'martial_arts' | 'walk' | 'gesture';
  color: string;
  pairedCharacterId?: string;
  rhFileName?: string;
}

export interface MotionTaskResult {
  id: string;
  characterName: string;
  characterImage: string;
  motionName: string;
  motionVideo: string;
  outputVideoUrl: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  progress: number;
  orientation: CharacterOrientation;
  prompt: string;
  createdAt: string;
  webappId: string;
  taskId?: string;
}

export interface RunningHubConfig {
  apiKey: string;
  webappId: string;
  useLiveApi: boolean;
}
