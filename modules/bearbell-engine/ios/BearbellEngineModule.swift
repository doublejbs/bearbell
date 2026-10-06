import ExpoModulesCore

final class AudioSessionActivationException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Failed to activate the audio session: \(param)"
  }
}

public class BearbellEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BearbellEngine")

    Events("onRunningChange")

    OnCreate { [weak self] in
      guard let self else {
        return
      }

      // Called on main after every actual transition, including Live Activity button toggles.
      BellEngine.shared.setRunningChangeHandler(owner: self) { [weak self] isRunning, source, sensitivity in
        self?.sendEvent("onRunningChange", [
          "isRunning": isRunning,
          "source": source.rawValue,
          "sensitivity": sensitivity.rawValue,
        ])
      }
    }

    // Runs off-main (module queue) when JS adds its first listener; report the current state once
    // so a UI mounted after an out-of-app start (Live Activity) restores running state and sensitivity.
    OnStartObserving("onRunningChange") {
      DispatchQueue.main.async {
        BellEngine.shared.notifyCurrentState(source: .restore)
      }
    }

    // Only detach the event handler: the engine must keep running while the app is in the background.
    // After a JS reload the new module re-syncs the UI via the restore event (OnStartObserving).
    OnDestroy { [weak self] in
      guard let self else {
        return
      }

      BellEngine.shared.clearRunningChangeHandler(owner: self)
    }

    AsyncFunction("start") { (sensitivity: String) in
      do {
        try BellEngine.shared.start(sensitivity: sensitivity, source: .app)
      } catch BellEngineError.audioSessionActivationFailed(let underlying) {
        throw AudioSessionActivationException(underlying.localizedDescription)
      }
    }
    .runOnQueue(.main)

    AsyncFunction("stop") {
      BellEngine.shared.stop(source: .app)
    }
    .runOnQueue(.main)

    // Sync functions run on the JS thread; the engine is main-thread confined.
    Function("setSensitivity") { (sensitivity: String) in
      DispatchQueue.main.async {
        BellEngine.shared.setSensitivity(sensitivity)
      }
    }

    Function("ringOnce") {
      DispatchQueue.main.async {
        BellEngine.shared.ringOnce()
      }
    }
  }
}
