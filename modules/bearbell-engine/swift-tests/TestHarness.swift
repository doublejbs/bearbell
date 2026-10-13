import Foundation

/// XCTest 없이 swiftc로 실행하는 최소 assert 하네스.
final class TestHarness {
  nonisolated(unsafe) static var passedTests = 0
  nonisolated(unsafe) static var failedTests: [String] = []
  nonisolated(unsafe) static var failedChecks = 0

  nonisolated(unsafe) private static var currentFailed = false
  nonisolated(unsafe) private static var currentName = ""

  static func run(_ name: String, _ body: () -> Void) {
    currentName = name
    currentFailed = false

    body()

    if currentFailed {
      failedTests.append(name)
      print("FAIL  \(name)")
    } else {
      passedTests += 1
      print("PASS  \(name)")
    }
  }

  static func recordFailure(_ message: String, file: StaticString, line: UInt) {
    currentFailed = true
    failedChecks += 1
    print("  ✗ [\(currentName)] \(file):\(line) \(message)")
  }

  /// 요약을 출력하고 실패가 있으면 1로 종료한다.
  static func finish() -> Never {
    let total = passedTests + failedTests.count

    print("")
    print("\(total) tests, \(passedTests) passed, \(failedTests.count) failed (\(failedChecks) failed checks)")

    if !failedTests.isEmpty {
      print("Failed: \(failedTests.joined(separator: ", "))")
      exit(1)
    }

    exit(0)
  }
}

func check(_ condition: Bool, _ message: @autoclosure () -> String = "", file: StaticString = #fileID, line: UInt = #line) {
  if !condition {
    TestHarness.recordFailure(message(), file: file, line: line)
  }
}
