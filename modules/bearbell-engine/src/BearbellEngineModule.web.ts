import { NativeModule, registerWebModule } from 'expo';

import type { RunningChangeEvent } from './BearbellEngineModule';

type BearbellEngineEvents = {
  onRunningChange: (event: RunningChangeEvent) => void;
};

// 웹은 지원하지 않는다 — 모든 호출은 no-op.
class BearbellEngineModule extends NativeModule<BearbellEngineEvents> {
  start = async () => {};

  stop = async () => {};

  setSensitivity = () => {};

  ringOnce = () => {};
}

export default registerWebModule(BearbellEngineModule, 'BearbellEngine');
