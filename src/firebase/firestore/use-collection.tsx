"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuth } from "firebase/auth";
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
  getDocs,
} from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null; // Document data with ID, or null.
  isLoading: boolean; // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
  mutate: () => void;
}

/* Internal implementation of Query:
  https://github.com/firebase/firebase-js-sdk/blob/c5f08a9bc5da0d2b0207802c972d53724ccef055/packages/firestore/src/lite-api/reference.ts#L143
*/
export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    };
  };
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Handles nullable references.
 *
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * use useMemo to memoize it per React guidence.  Also make sure that it's dependencies are stable
 * references
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {CollectionReference<DocumentData> | Query<DocumentData> | null | undefined} targetRefOrQuery -
 * The Firestore CollectionReference or Query. Waits if null/undefined.
 * @returns {UseCollectionResult<T>} Object with data, isLoading, error.
 */
export function useCollection<T = any>(
  memoizedTargetRefOrQuery:
    | ((CollectionReference<DocumentData> | Query<DocumentData>) & {
        __memo?: boolean;
      })
    | null
    | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(
    !!memoizedTargetRefOrQuery,
  );
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!memoizedTargetRefOrQuery) return;
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(memoizedTargetRefOrQuery);
      const results: ResultItemType[] = [];
      for (const doc of querySnapshot.docs) {
        results.push({ ...(doc.data() as T), id: doc.id });
      }
      setData(results);
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [memoizedTargetRefOrQuery]);

  useEffect(() => {
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = [];
        for (const doc of snapshot.docs) {
          results.push({ ...(doc.data() as T), id: doc.id });
        }
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        try {
          const auth = getAuth();
          if (error.code === "permission-denied" && !auth.currentUser) {
            setIsLoading(false);
            return; // Suppress error during logout.
          }
        } catch (e) {
          // If getAuth fails, it means firebase is not initialized, we are unmounting, safe to ignore.
          return;
        }

        const path: string =
          memoizedTargetRefOrQuery.type === "collection"
            ? (memoizedTargetRefOrQuery as CollectionReference).path
            : (
                memoizedTargetRefOrQuery as unknown as InternalQuery
              )._query.path.canonicalString();

        console.error(
          `Firestore onSnapshot error on path '${path}': ${error.message} (Code: ${error.code})`,
        );

        if (error.code === "permission-denied") {
          const contextualError = new FirestorePermissionError({
            operation: "list",
            path,
          });
          setError(contextualError);

          if (contextualError.request.auth) {
            errorEmitter.emit("permission-error", contextualError);
          }
        } else {
          setError(error);
        }

        setData(null);
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery]); // Re-run if the target query/reference changes.

  if (
    memoizedTargetRefOrQuery &&
    (memoizedTargetRefOrQuery as any).__memo !== true
  ) {
    // This check helps prevent infinite loops by ensuring the query is memoized.
    // console.warn('useCollection detected a non-memoized query. This can lead to performance issues. Wrap the query() call in useMemoFirebase().', memoizedTargetRefOrQuery);
  }

  return { data, isLoading, error, mutate: fetchData };
}
