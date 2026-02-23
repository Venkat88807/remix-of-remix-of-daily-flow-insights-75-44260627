import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.1149aacd1d37483ba33873e03d9b20c6',
  appName: 'TimeGuard',
  webDir: 'dist',
  // Uncomment the server block below ONLY for development hot-reload:
  // server: {
  //   url: 'https://1149aacd-1d37-483b-a338-73e03d9b20c6.lovableproject.com?forceHideBadge=true',
  //   cleartext: true
  // },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#488AFF',
      sound: 'beep.wav'
    }
  }
};

export default config;
