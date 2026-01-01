const UAParser = require('ua-parser-js');

class DeviceDetector {
  static detectFromHeaders(headers) {
    const userAgent = headers['user-agent'] || '';
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    
    return {
      type: this.getDeviceType(result),
      platform: result.os.name || 'unknown',
      os: result.os.name || 'unknown',
      browser: result.browser.name || 'unknown',
      browserVersion: result.browser.version || '',
      isMobile: result.device.type === 'mobile',
      isTablet: result.device.type === 'tablet',
      isDesktop: result.device.type === undefined
    };
  }
  
  static detectFromSocket(socket) {
    const userAgent = socket.handshake.headers['user-agent'] || '';
    return this.detectFromHeaders({ 'user-agent': userAgent });
  }
  
  static getDeviceType(uaResult) {
    if (uaResult.device.type === 'mobile') return 'mobile';
    if (uaResult.device.type === 'tablet') return 'tablet';
    if (uaResult.os.name?.includes('Android') || uaResult.os.name?.includes('iOS')) {
      return 'mobile';
    }
    return 'desktop';
  }
  
  static getDeviceName(uaResult, customName) {
    if (customName) return customName;
    
    const { browser, os, device } = uaResult;
    const browserName = browser.name || 'Unknown Browser';
    const osName = os.name || 'Unknown OS';
    const deviceType = device.type || 'device';
    
    return `${browserName} on ${osName} (${deviceType})`;
  }
}

export default DeviceDetector;