import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'

export function useActiveConnections() {
  const [connections, setConnections] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'active_connections'), orderBy('last_seen', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        setConnections(
          snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            last_seen: doc.data().last_seen?.toDate?.() ?? null,
          }))
        )
      },
      console.error
    )
  }, [])

  return connections
}
