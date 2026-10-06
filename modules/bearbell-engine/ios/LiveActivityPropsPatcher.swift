import Foundation

/// Rewrites the Live Activity `props` JSON (`BearbellLiveActivityProps` in
/// src/liveActivity/BearbellLiveActivity.tsx) when native updates the display without JS.
/// Only `isArmed` (and `startedAtMs` when given) change; `copy`, `sensitivityLabel` and any other
/// key are kept, since they already hold the translated strings JS wrote.
enum LiveActivityPropsPatcher {
  static let isArmedKey = "isArmed"
  static let startedAtMsKey = "startedAtMs"

  /// Returns the patched JSON, or nil when `propsJSON` is not a valid JSON object.
  /// `startedAtMs` is written as a JSON number (an integer when it has no fractional part).
  static func patch(propsJSON: String, isArmed: Bool, startedAtMs: Double?) -> String? {
    guard
      let data = propsJSON.data(using: .utf8),
      let parsed = try? JSONSerialization.jsonObject(with: data),
      var props = parsed as? [String: Any]
    else {
      return nil
    }

    props[isArmedKey] = NSNumber(value: isArmed)

    if let startedAtMs {
      props[startedAtMsKey] = makeNumber(startedAtMs)
    }

    guard
      JSONSerialization.isValidJSONObject(props),
      let output = try? JSONSerialization.data(withJSONObject: props, options: [.withoutEscapingSlashes])
    else {
      return nil
    }

    return String(data: output, encoding: .utf8)
  }

  /// `isArmed` of the props JSON, or nil when it is not a JSON object with a boolean `isArmed`.
  static func isArmed(propsJSON: String) -> Bool? {
    guard
      let data = propsJSON.data(using: .utf8),
      let props = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let number = props[isArmedKey] as? NSNumber,
      CFGetTypeID(number) == CFBooleanGetTypeID()
    else {
      return nil
    }

    return number.boolValue
  }

  private static func makeNumber(_ value: Double) -> NSNumber {
    let isIntegral = value.isFinite && value == value.rounded()
    let fitsInt64 = abs(value) < 9.0e18

    if isIntegral && fitsInt64 {
      return NSNumber(value: Int64(value))
    }

    return NSNumber(value: value)
  }
}
