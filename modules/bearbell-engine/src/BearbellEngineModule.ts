import { NativeModule, requireNativeModule } from 'expo';

import { RunningChangeSource } from './RunningChangeSource';
import { Sensitivity } from './Sensitivity';

export type RunningChangeEvent = {
  isRunning: boolean;
  source: RunningChangeSource;
  sensitivity: Sensitivity;
};

type BearbellEngineEvents = {
  onRunningChange: (event: RunningChangeEvent) => void;
};

declare class BearbellEngineModule extends NativeModule<BearbellEngineEvents> {
  start(sensitivity: Sensitivity): Promise<void>;
  stop(): Promise<void>;
  setSensitivity(sensitivity: Sensitivity): void;
  ringOnce(): void;
}

export default requireNativeModule<BearbellEngineModule>('BearbellEngine');
