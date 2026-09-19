import { MongoClient, type Db, type Collection, type Document } from "mongodb";

/**
 * The client is cached in module scope so a warm Lambda container reuses the
 * pool instead of opening a new connection on every request.
 */
let clientPromise: Promise<MongoClient> | null = null;

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
  });
  return client.connect();
}

export async function getDb(): Promise<Db> {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null; // let the next request retry
      throw err;
    });
  }
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "yewon_sms");
}

export async function coll<T extends Document = Document>(
  name: string
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

/** Korean-aware sorting for name/major columns. */
export const KO_COLLATION = { locale: "ko", numericOrdering: true } as const;

export const COLLECTIONS = {
  students: "students",
  consultations: "consultations",
  settings: "settings",
  info: "info",
  loginAttempts: "login_attempts",
} as const;
