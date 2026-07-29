import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  getDocFromServer,
  doc as firestoreDoc,
  Unsubscribe,
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Ingredient, StockLog, MenuItem, UserProfile } from '../types';

// Initialize Firebase App if not already initialized
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore specifying database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Cloud Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 1. Connection check
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(firestoreDoc(db, 'app_settings', 'health_check'));
    return true;
  } catch (error) {
    console.warn('Firestore connection check notice:', error);
    return false;
  }
}

// 2. Real-time Subscriptions
export function subscribeIngredients(onUpdate: (ingredients: Ingredient[]) => void): Unsubscribe {
  const colRef = collection(db, 'ingredients');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: Ingredient[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Ingredient);
      });
      // Sort by name
      items.sort((a, b) => a.name.localeCompare(b.name));
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ingredients');
    }
  );
}

export function subscribeLogs(onUpdate: (logs: StockLog[]) => void): Unsubscribe {
  const colRef = collection(db, 'stock_logs');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const logs: StockLog[] = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as StockLog);
      });
      onUpdate(logs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stock_logs');
    }
  );
}

export function subscribeMenus(onUpdate: (menus: MenuItem[]) => void): Unsubscribe {
  const colRef = collection(db, 'menus');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const menus: MenuItem[] = [];
      snapshot.forEach((doc) => {
        menus.push({ id: doc.id, ...doc.data() } as MenuItem);
      });
      onUpdate(menus);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'menus');
    }
  );
}

export function subscribeStaffProfiles(onUpdate: (staff: UserProfile[]) => void): Unsubscribe {
  const colRef = collection(db, 'staff_profiles');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const staff: UserProfile[] = [];
      snapshot.forEach((doc) => {
        staff.push({ id: doc.id, ...doc.data() } as UserProfile);
      });
      onUpdate(staff);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'staff_profiles');
    }
  );
}

export function subscribeAppSettings(
  onUpdate: (settings: { appName: string; appLogoText: string; appLogoUrl: string }) => void
): Unsubscribe {
  const docRef = doc(db, 'app_settings', 'profile');
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        onUpdate({
          appName: data.appName || 'Dapur SPPG',
          appLogoText: data.appLogoText || 'SP',
          appLogoUrl: data.appLogoUrl || '',
        });
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'app_settings/profile');
    }
  );
}

// 3. Single Mutations (Saved directly to Google Cloud Firestore)
export async function saveIngredientCloud(ingredient: Ingredient): Promise<void> {
  const path = `ingredients/${ingredient.id}`;
  try {
    const docRef = doc(db, 'ingredients', ingredient.id);
    await setDoc(docRef, ingredient, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteIngredientCloud(ingredientId: string): Promise<void> {
  const path = `ingredients/${ingredientId}`;
  try {
    const docRef = doc(db, 'ingredients', ingredientId);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function addStockLogCloud(log: StockLog): Promise<void> {
  const path = `stock_logs/${log.id}`;
  try {
    const docRef = doc(db, 'stock_logs', log.id);
    await setDoc(docRef, log);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveMenuCloud(menu: MenuItem): Promise<void> {
  const path = `menus/${menu.id}`;
  try {
    const docRef = doc(db, 'menus', menu.id);
    await setDoc(docRef, menu, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMenuCloud(menuId: string): Promise<void> {
  const path = `menus/${menuId}`;
  try {
    const docRef = doc(db, 'menus', menuId);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveStaffProfileCloud(profile: UserProfile): Promise<void> {
  const path = `staff_profiles/${profile.id}`;
  try {
    const docRef = doc(db, 'staff_profiles', profile.id);
    await setDoc(docRef, profile, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteStaffProfileCloud(profileId: string): Promise<void> {
  const path = `staff_profiles/${profileId}`;
  try {
    const docRef = doc(db, 'staff_profiles', profileId);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveAppSettingsCloud(appName: string, appLogoText: string, appLogoUrl: string): Promise<void> {
  const path = 'app_settings/profile';
  try {
    const docRef = doc(db, 'app_settings', 'profile');
    await setDoc(docRef, { appName, appLogoText, appLogoUrl }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// 4. Seed Initial Cloud Data if Database is empty
export async function seedInitialCloudDataIfEmpty(
  defaultIngredients: Ingredient[],
  defaultLogs: StockLog[],
  defaultMenus: MenuItem[],
  defaultStaff: UserProfile[]
): Promise<void> {
  try {
    const ingSnap = await getDocs(collection(db, 'ingredients'));
    if (ingSnap.empty) {
      console.log('Seeding initial ingredients to Google Cloud Firestore...');
      const batch = writeBatch(db);
      defaultIngredients.forEach((item) => {
        batch.set(doc(db, 'ingredients', item.id), item);
      });
      await batch.commit();
    }

    const logSnap = await getDocs(collection(db, 'stock_logs'));
    if (logSnap.empty) {
      const batch = writeBatch(db);
      defaultLogs.forEach((item) => {
        batch.set(doc(db, 'stock_logs', item.id), item);
      });
      await batch.commit();
    }

    const menuSnap = await getDocs(collection(db, 'menus'));
    if (menuSnap.empty) {
      const batch = writeBatch(db);
      defaultMenus.forEach((item) => {
        batch.set(doc(db, 'menus', item.id), item);
      });
      await batch.commit();
    }

    const staffSnap = await getDocs(collection(db, 'staff_profiles'));
    if (staffSnap.empty) {
      const batch = writeBatch(db);
      defaultStaff.forEach((item) => {
        batch.set(doc(db, 'staff_profiles', item.id), item);
      });
      await batch.commit();
    }

    const setSnap = await getDocs(collection(db, 'app_settings'));
    if (setSnap.empty) {
      await setDoc(doc(db, 'app_settings', 'profile'), {
        appName: 'Dapur SPPG',
        appLogoText: 'SP',
        appLogoUrl: '',
      });
    }
  } catch (err) {
    console.error('Seeding cloud data error:', err);
  }
}
