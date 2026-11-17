# Role-based dashboard setup

The dashboard uses Firebase Authentication for sign-in. The backend verifies every Firebase ID token and reads the user's role and assigned place from Realtime Database before returning protected data.

## 1. Configure Firebase

1. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**.
2. Download a Firebase service account key and save it as `iot-backend/serviceAccountKey.json`. Keep this file private; it is ignored by Git.
3. Set `FIREBASE_URL` in `iot-backend/.env` to the Realtime Database URL. The backend must start with the service account key; without it, protected APIs return a configuration error.
4. Copy `iot-dashboard/.env.example` to `iot-dashboard/.env.local` and fill in the Firebase web app values from Project Settings. Restart the dashboard after changing this file.
5. Apply `database.rules.json` to the Realtime Database. The dashboard accesses records through the authenticated backend, not directly from browser code. Firebase Admin SDK access on the backend bypasses these client rules.

The legacy `iot-backend/phone-gps.html` page writes directly to `/gps` without signing in. It will stop working under the deny-by-default database rules; use sensor GPS or the assigned place coordinates until that utility is moved behind an authenticated endpoint.

## 2. Bootstrap the first administrator

1. Create the first admin email/password account in Firebase Authentication.
2. Copy that account's Firebase UID.
3. In Realtime Database, create `accessControl/users/<UID>` with:

```json
{
  "email": "admin@example.com",
  "displayName": "Project Administrator",
  "role": "admin",
  "locationIds": [],
  "active": true
}
```

Only an administrator can create further dashboard accounts from **Settings**. User passwords are sent to Firebase Authentication by the backend and are never stored in Realtime Database.

## 3. Add places and scope accounts

1. Sign in as the admin and open **Settings**.
2. Add a named place. Add latitude and longitude if its sensor may not provide GPS.
3. Open **Devices** and assign each registered sensor node to its place.
4. In **Settings**, create a location-user account and choose its assigned place.

New blocks inherit the node's place assignment. When a node is first assigned, existing unassigned blocks from that node are backfilled with the place ID. This keeps history attached to the original place if a node is moved later.

## Access rules

- **Admin:** sees all places and blocks, verifies the full hash chain, runs recovery, assigns nodes, creates places, and creates users.
- **Location user:** receives blocks and nodes for assigned place IDs only. The API filters records and WebSocket updates on the server; admin verification and recovery routes reject user accounts.
- **Realtime Database:** browser clients should have no direct read/write access. Keep the service account key private and use HTTPS/WSS outside local development.

Place assignment currently means **sensor-node assignment**, not drawing a geographic boundary. The admin account form assigns one named place to each location user.
