// Karma configuration for performance tests
module.exports = (config) => {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {
        // Performance tests may take longer
        DEFAULT_TIMEOUT_INTERVAL: 60000
      },
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true // removes the duplicated traces
    },
    coverageReporter: {
      dir: require('node:path').join(__dirname, '../coverage/performance'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcov' }
      ],
      check: {
        global: {
          statements: 60, // Lower coverage requirements for performance tests
          branches: 50,
          functions: 60,
          lines: 60
        }
      }
    },
    reporters: ['progress', 'kjhtml', 'coverage'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ['ChromeHeadlessPerformance'],
    customLaunchers: {
      ChromeHeadlessPerformance: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--max-old-space-size=4096', // Increase memory for performance tests
          '--js-flags="--max-old-space-size=4096"'
        ]
      },
      ChromePerformance: {
        base: 'Chrome',
        flags: [
          '--no-sandbox',
          '--disable-web-security',
          '--max-old-space-size=4096',
          '--js-flags="--max-old-space-size=4096"'
        ]
      }
    },
    singleRun: true,
    restartOnFileChange: false,
    
    // Performance test specific settings
    browserNoActivityTimeout: 120000, // 2 minutes
    browserDisconnectTimeout: 60000,  // 1 minute
    browserDisconnectTolerance: 3,
    captureTimeout: 120000,           // 2 minutes
    
    // Include performance test files
    files: [
      'src/app/performance-tests/**/*.spec.ts',
      'src/app/integration-tests/**/*.spec.ts'
    ],
    
    // Exclude unit tests
    exclude: [
      'src/app/**/*.spec.ts',
      '!src/app/performance-tests/**/*.spec.ts',
      '!src/app/integration-tests/**/*.spec.ts'
    ]
  });
};