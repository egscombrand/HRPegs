import admin from 'firebase-admin';

/**
 * Validates and normalizes the Firebase Private Key.
 * Handles both one-line escaped \n and literal multiline strings.
 */
function getNormalizedPrivateKey(key: string | undefined): string | null {
    if (!key) return null;
    
    // 1. If it's a JSON-stringified key (with literal \n characters), unescape them
    let normalized = key.replace(/\\n/g, '\n');
    
    // 2. Trim quotes if they exist (sometimes users wrap keys in quotes in .env)
    normalized = normalized.trim();
    if (normalized.startsWith('"') && normalized.endsWith('"')) {
        normalized = normalized.slice(1, -1);
    }
    
    return normalized;
}

if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = getNormalizedPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

    // CRITICAL: Validate config before initialization to avoid silent SDK failures
    if (!projectId || !clientEmail || !privateKey) {
        let missing = [];
        if (!projectId) missing.push('FIREBASE_PROJECT_ID');
        if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
        if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
        
        console.error(`[Firebase Admin] CRITICAL CONFIG ERROR: Missing ${missing.join(', ')} in environment variables.`);
    } else {
        try {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
            console.log('[Firebase Admin] Local SDK initialized successfully.');
        } catch (error: any) {
            console.error('[Firebase Admin] Initialization failed:', error.message);
            // We don't throw here to avoid crashing the whole process, 
            // but subsequent service calls (auth, firestore) will report the missing app error via the SDK itself.
        }
    }
}

export default admin;

