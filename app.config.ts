import { config as dotenvConfig } from 'dotenv';
import type { ExpoConfig, ConfigContext } from 'expo/config';

// Load .env locally; on EAS cloud builds the file won't exist —
// dotenv silently no-ops and EAS-injected env vars are already in process.env.
dotenvConfig();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'unflat',
  slug: 'x-yield-mobile',
  extra: {
    privyAppId: process.env.PRIVY_APP_ID,
    privyClientId: process.env.PRIVY_CLIENT_ID,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    mixpanelToken: process.env.MIXPANEL_TOKEN,
    uxcamAppKey: process.env.UXCAM_APP_KEY,
    cdpRpcUrl: process.env.CDP_RPC_URL,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
