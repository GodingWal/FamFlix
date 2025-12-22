// IndexedDB utility for storing recordings and progress
const DB_NAME = 'FamFlixR';
const DB_VERSION = 1;
const RECORDINGS_STORE = 'recordings';
const PROGRESS_STORE = 'progress';

interface RecordingData {
  id: string;
  sessionId: string;
  promptId: string;
  blob: Blob;
  duration: number;
  quality: any;
  timestamp: number;
}

interface ProgressData {
  sessionId: string;
  currentStep: number;
  recordings: any[];
  // Optional: stored voice clone name for this session
  voiceName?: string;
  timestamp: number;
}

class IndexedDBManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create recordings store
        if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
          const recordingsStore = db.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' });
          recordingsStore.createIndex('sessionId', 'sessionId', { unique: false });
          recordingsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create progress store
        if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
          db.createObjectStore(PROGRESS_STORE, { keyPath: 'sessionId' });
        }
      };
    });
  }

  async saveRecording(data: RecordingData): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([RECORDINGS_STORE], 'readwrite');
      const store = transaction.objectStore(RECORDINGS_STORE);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getRecording(id: string): Promise<RecordingData | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([RECORDINGS_STORE], 'readonly');
      const store = transaction.objectStore(RECORDINGS_STORE);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getRecordingsBySession(sessionId: string): Promise<RecordingData[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([RECORDINGS_STORE], 'readonly');
      const store = transaction.objectStore(RECORDINGS_STORE);
      const index = store.index('sessionId');
      const request = index.getAll(sessionId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRecording(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([RECORDINGS_STORE], 'readwrite');
      const store = transaction.objectStore(RECORDINGS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveProgress(data: ProgressData): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PROGRESS_STORE], 'readwrite');
      const store = transaction.objectStore(PROGRESS_STORE);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProgress(sessionId: string): Promise<ProgressData | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PROGRESS_STORE], 'readonly');
      const store = transaction.objectStore(PROGRESS_STORE);
      const request = store.get(sessionId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteProgress(sessionId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PROGRESS_STORE], 'readwrite');
      const store = transaction.objectStore(PROGRESS_STORE);
      const request = store.delete(sessionId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllData(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([RECORDINGS_STORE, PROGRESS_STORE], 'readwrite');
      
      const recordingsStore = transaction.objectStore(RECORDINGS_STORE);
      const progressStore = transaction.objectStore(PROGRESS_STORE);
      
      recordingsStore.clear();
      progressStore.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

export const dbManager = new IndexedDBManager();
