# Backend Implementation for Push Notifications

This document contains the code to implement on your backend (`x-yield-api.vercel.app`).

## 1. Install Dependencies

```bash
npm install expo-server-sdk
```

## 2. Database Schema (Vercel KV or your DB)

If using Vercel KV, the data structure will be:
- Key: `notifications:{wallet_address}:{device_id}`
- Value: JSON with token and preferences

If using a SQL database, create this table:

```sql
CREATE TABLE push_notifications (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  expo_push_token VARCHAR(100) NOT NULL,
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
  notifications_enabled BOOLEAN DEFAULT true,
  deposit_notifications BOOLEAN DEFAULT true,
  withdrawal_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, device_id)
);

CREATE INDEX idx_notifications_wallet ON push_notifications(wallet_address);
CREATE INDEX idx_notifications_token ON push_notifications(expo_push_token);
```

## 3. API Endpoints

### POST /api/notifications/register

Create file: `api/notifications/register.ts`

```typescript
import { kv } from '@vercel/kv';
import { Expo } from 'expo-server-sdk';

const expo = new Expo();

interface RegisterRequest {
  expo_push_token: string;
  device_id: string;
  platform: 'ios' | 'android';
  wallet_address: string;
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: RegisterRequest = await req.json();
    const { expo_push_token, device_id, platform, wallet_address } = body;

    // Validate required fields
    if (!expo_push_token || !device_id || !platform || !wallet_address) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate Expo push token
    if (!Expo.isExpoPushToken(expo_push_token)) {
      return new Response(
        JSON.stringify({ error: 'Invalid Expo push token' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Store in Vercel KV
    const key = `notifications:${wallet_address.toLowerCase()}:${device_id}`;
    const data = {
      expo_push_token,
      device_id,
      platform,
      wallet_address: wallet_address.toLowerCase(),
      notifications_enabled: true,
      deposit_notifications: true,
      withdrawal_notifications: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(key, JSON.stringify(data));

    // Also add to a set for easy lookup by wallet
    await kv.sadd(`wallet_devices:${wallet_address.toLowerCase()}`, device_id);

    return new Response(
      JSON.stringify({ success: true, message: 'Token registered successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error registering push token:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### DELETE /api/notifications/unregister

Create file: `api/notifications/unregister.ts`

```typescript
import { kv } from '@vercel/kv';

interface UnregisterRequest {
  device_id: string;
  wallet_address: string;
}

export default async function handler(req: Request) {
  if (req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: UnregisterRequest = await req.json();
    const { device_id, wallet_address } = body;

    if (!device_id || !wallet_address) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const key = `notifications:${wallet_address.toLowerCase()}:${device_id}`;

    // Delete the notification record
    await kv.del(key);

    // Remove from wallet devices set
    await kv.srem(`wallet_devices:${wallet_address.toLowerCase()}`, device_id);

    return new Response(
      JSON.stringify({ success: true, message: 'Token unregistered successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error unregistering push token:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### PUT /api/notifications/preferences

Create file: `api/notifications/preferences.ts`

```typescript
import { kv } from '@vercel/kv';

interface PreferencesRequest {
  device_id: string;
  wallet_address: string;
  notifications_enabled?: boolean;
  deposit_notifications?: boolean;
  withdrawal_notifications?: boolean;
}

export default async function handler(req: Request) {
  if (req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: PreferencesRequest = await req.json();
    const {
      device_id,
      wallet_address,
      notifications_enabled,
      deposit_notifications,
      withdrawal_notifications,
    } = body;

    if (!device_id || !wallet_address) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const key = `notifications:${wallet_address.toLowerCase()}:${device_id}`;

    // Get existing data
    const existingData = await kv.get(key);

    if (!existingData) {
      return new Response(
        JSON.stringify({ error: 'Device not registered' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = typeof existingData === 'string'
      ? JSON.parse(existingData)
      : existingData;

    // Update preferences
    const updatedData = {
      ...data,
      notifications_enabled: notifications_enabled ?? data.notifications_enabled,
      deposit_notifications: deposit_notifications ?? data.deposit_notifications,
      withdrawal_notifications: withdrawal_notifications ?? data.withdrawal_notifications,
      updated_at: new Date().toISOString(),
    };

    await kv.set(key, JSON.stringify(updatedData));

    return new Response(
      JSON.stringify({ success: true, message: 'Preferences updated successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error updating preferences:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

## 4. Notification Sending Service

Create file: `lib/pushNotifications.ts`

```typescript
import { Expo, ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from 'expo-server-sdk';
import { kv } from '@vercel/kv';

const expo = new Expo();

interface NotificationData {
  expo_push_token: string;
  device_id: string;
  platform: string;
  wallet_address: string;
  notifications_enabled: boolean;
  deposit_notifications: boolean;
  withdrawal_notifications: boolean;
}

export type NotificationType = 'deposit' | 'withdrawal';

export async function sendPushNotification(
  walletAddress: string,
  type: NotificationType,
  amount: string,
  txHash?: string
): Promise<void> {
  try {
    // Get all devices for this wallet
    const deviceIds = await kv.smembers(`wallet_devices:${walletAddress.toLowerCase()}`);

    if (!deviceIds || deviceIds.length === 0) {
      console.log(`No registered devices for wallet ${walletAddress}`);
      return;
    }

    const messages: ExpoPushMessage[] = [];
    const tokensToRemove: { key: string; deviceId: string }[] = [];

    for (const deviceId of deviceIds) {
      const key = `notifications:${walletAddress.toLowerCase()}:${deviceId}`;
      const dataStr = await kv.get(key);

      if (!dataStr) continue;

      const data: NotificationData = typeof dataStr === 'string'
        ? JSON.parse(dataStr)
        : dataStr;

      // Check if notifications are enabled
      if (!data.notifications_enabled) continue;

      // Check specific notification type preference
      if (type === 'deposit' && !data.deposit_notifications) continue;
      if (type === 'withdrawal' && !data.withdrawal_notifications) continue;

      // Validate token
      if (!Expo.isExpoPushToken(data.expo_push_token)) {
        console.log(`Invalid token for device ${deviceId}, marking for removal`);
        tokensToRemove.push({ key, deviceId });
        continue;
      }

      // Build notification message
      const title = type === 'deposit' ? 'Deposit Completed' : 'Withdrawal Processed';
      const body = type === 'deposit'
        ? `Your deposit of $${amount} has been completed successfully.`
        : `Your withdrawal of $${amount} has been processed.`;

      messages.push({
        to: data.expo_push_token,
        sound: 'default',
        title,
        body,
        data: {
          type,
          amount,
          txHash,
          walletAddress,
        },
        channelId: 'transactions', // Android notification channel
      });
    }

    // Remove invalid tokens
    for (const { key, deviceId } of tokensToRemove) {
      await kv.del(key);
      await kv.srem(`wallet_devices:${walletAddress.toLowerCase()}`, deviceId);
    }

    if (messages.length === 0) {
      console.log('No valid recipients for notification');
      return;
    }

    // Send notifications in chunks (Expo recommends max 100 per request)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending notification chunk:', error);
      }
    }

    // Store tickets for receipt checking (optional but recommended)
    // You could store these in KV and check receipts later
    console.log(`Sent ${tickets.length} notifications for ${type} to wallet ${walletAddress}`);

    // Handle failed tickets immediately
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === 'error') {
        console.error(`Notification error: ${ticket.message}`);

        // If the error is about an invalid token, remove it
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const message = messages[i];
          const token = message.to as string;

          // Find and remove the device with this token
          for (const deviceId of deviceIds) {
            const key = `notifications:${walletAddress.toLowerCase()}:${deviceId}`;
            const dataStr = await kv.get(key);
            if (dataStr) {
              const data: NotificationData = typeof dataStr === 'string'
                ? JSON.parse(dataStr)
                : dataStr;
              if (data.expo_push_token === token) {
                await kv.del(key);
                await kv.srem(`wallet_devices:${walletAddress.toLowerCase()}`, deviceId);
                console.log(`Removed invalid device ${deviceId}`);
                break;
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in sendPushNotification:', error);
  }
}

// Helper to format currency
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
```

## 5. Integration with Transaction Handlers

Add notification calls to your existing deposit/withdrawal handlers:

```typescript
// In your deposit completion handler
import { sendPushNotification, formatCurrency } from '../lib/pushNotifications';

// After deposit is confirmed on-chain:
await sendPushNotification(
  walletAddress,
  'deposit',
  formatCurrency(depositAmount),
  txHash
);

// In your withdrawal completion handler:
await sendPushNotification(
  walletAddress,
  'withdrawal',
  formatCurrency(withdrawalAmount),
  txHash
);
```

## 6. Webhook for Transaction Monitoring (Optional)

If you want to automatically send notifications when transactions are confirmed,
you could set up a webhook with a service like Alchemy or use Blockscout's webhooks.

Create file: `api/webhooks/transaction.ts`

```typescript
import { sendPushNotification, formatCurrency } from '../../lib/pushNotifications';

// Example webhook handler for Alchemy
export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();

    // Verify webhook signature (implement based on your provider)
    // ...

    const { event, data } = body;

    if (event === 'transaction_confirmed') {
      const { walletAddress, type, amount, txHash } = data;

      if (type === 'deposit' || type === 'withdrawal') {
        await sendPushNotification(
          walletAddress,
          type,
          formatCurrency(amount),
          txHash
        );
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
```

## 7. Environment Variables

Add to your Vercel environment:

```
# Already have KV configured
KV_REST_API_URL=...
KV_REST_API_TOKEN=...

# No additional env vars needed for Expo push notifications
# The expo-server-sdk uses Expo's public push API
```

## 8. Testing

To test notifications locally:

```typescript
// test-notification.ts
import { sendPushNotification } from './lib/pushNotifications';

async function test() {
  await sendPushNotification(
    '0xYOUR_WALLET_ADDRESS',
    'deposit',
    '100.00',
    '0xTEST_TX_HASH'
  );
}

test();
```

## Summary

1. Install `expo-server-sdk` in your backend
2. Create the 3 API endpoints (register, unregister, preferences)
3. Create the notification sending service
4. Call `sendPushNotification()` after deposit/withdrawal completion
5. (Optional) Set up webhooks for automatic transaction monitoring
