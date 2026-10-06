Pod::Spec.new do |s|
  s.name           = 'BearbellEngine'
  s.version        = '1.0.0'
  s.summary        = 'Shake-to-ring bear bell engine for bearbell'
  s.description    = 'Detects phone shakes with CoreMotion and rings a synthesized bear bell with AVFoundation, staying alive in the background via the audio background mode.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'CoreMotion'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.resource_bundles = {
    'BearbellEngineAssets' => ['Assets/*.wav']
  }
end
