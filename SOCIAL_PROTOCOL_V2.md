# Social Protocol V2 - Documentazione

## Introduzione

Il **Social Protocol V2** è un'implementazione migliorata del protocollo social network per GunDB, ispirata al design di `social-protocol-v2.js`. Offre una struttura più organizzata e funzionalità avanzate rispetto all'implementazione base.

## Caratteristiche Principali

### 1. **Architettura Migliorata**
- **User Space**: I dati dell'utente sono salvati nel suo spazio personale (sovranità dei dati)
- **Discovery**: Timeline pubblica organizzata per data per migliori performance
- **Cache Profili**: Sistema di cache per ridurre le richieste di rete

### 2. **Funzionalità Avanzate**
- ✅ Timeline organizzata per data (`timeline/YYYY-MM-DD`)
- ✅ Threading/risposte migliorato
- ✅ Indice hashtag automatico
- ✅ Supporto media/IPFS (preparato per implementazione futura)
- ✅ Cache profili utente
- ✅ Gestione profili estesa

### 3. **Integrazione con Shogun SDK**
Il protocollo si integra perfettamente con Shogun SDK, utilizzando l'istanza GunDB già configurata.

## Utilizzo

### Hook React: `useSocialProtocol`

Il modo più semplice per usare il protocollo è attraverso l'hook React:

```typescript
import { useSocialProtocol } from '../hooks/useSocialProtocol';

function MyComponent() {
  const {
    socialNetwork,
    isReady,
    posts,
    loading,
    error,
    publishPost,
    viewGlobalTimeline,
    viewHashtag,
    getUserProfile,
    updateProfile,
  } = useSocialProtocol();

  // Pubblicare un post
  const handlePost = async () => {
    const result = await publishPost('Ciao mondo! #test');
    if (result.success) {
      console.log('Post pubblicato:', result.id);
    }
  };

  // Visualizzare la timeline
  useEffect(() => {
    if (isReady) {
      viewGlobalTimeline();
    }
  }, [isReady]);

  return (
    <div>
      {loading && <p>Caricamento...</p>}
      {posts.map(post => (
        <div key={post.id}>
          <p>{post.content}</p>
          <p>Autore: {post.authorProfile?.displayName || 'Anonimo'}</p>
        </div>
      ))}
    </div>
  );
}
```

### Classe SocialNetwork (Diretto)

Se preferisci usare la classe direttamente:

```typescript
import { SocialNetwork } from '../utils/socialProtocol';
import { useShogun } from 'shogun-button-react';

function MyComponent() {
  const { sdk } = useShogun();
  const [network, setNetwork] = useState<SocialNetwork | null>(null);

  useEffect(() => {
    if (sdk?.gun) {
      const socialNetwork = new SocialNetwork({
        appName: 'shogun-mistodon-clone-v1',
        shogunCore: sdk,
      });
      setNetwork(socialNetwork);
    }
  }, [sdk]);

  // Pubblicare un post
  const publish = async () => {
    if (network) {
      const result = await network.publishPost('Ciao! #hashtag');
      console.log(result);
    }
  };

  // Visualizzare timeline
  useEffect(() => {
    if (network) {
      const cleanup = network.viewGlobalTimeline((post) => {
        console.log('Nuovo post:', post);
      });

      return cleanup; // Cleanup quando il componente si smonta
    }
  }, [network]);
}
```

## API Reference

### `SocialNetwork` Class

#### Constructor
```typescript
new SocialNetwork(config: {
  appName?: string;
  shogunCore: ShogunCore;
})
```

#### Metodi Principali

##### `publishPost(text, mediaFile?, replyToId?)`
Pubblica un nuovo post.

```typescript
const result = await network.publishPost(
  'Testo del post #hashtag',
  null, // mediaFile (Blob) - opzionale
  null  // replyToId - opzionale, per risposte
);
```

##### `viewGlobalTimeline(callback)`
Visualizza la timeline globale. Restituisce una funzione di cleanup.

```typescript
const cleanup = network.viewGlobalTimeline((post) => {
  console.log('Post:', post);
  // post include authorProfile se disponibile
});

// Cleanup quando non serve più
cleanup();
```

##### `viewReplies(postId, callback)`
Visualizza le risposte a un post specifico.

```typescript
const cleanup = network.viewReplies('post_123', (reply) => {
  console.log('Risposta:', reply);
});
```

##### `viewHashtag(hashtag, callback)`
Visualizza i post con un hashtag specifico.

```typescript
const cleanup = network.viewHashtag('test', (post) => {
  console.log('Post con hashtag:', post);
});
```

##### `getUserProfile(userPub, callback)`
Ottiene il profilo di un utente (con cache).

```typescript
network.getUserProfile('user_pub_key', (profile) => {
  console.log('Profilo:', profile);
});
```

##### `updateProfile(profileData)`
Aggiorna il profilo dell'utente corrente.

```typescript
await network.updateProfile({
  displayName: 'Nuovo Nome',
  bio: 'Nuova bio',
  avatarCid: 'QmHash...'
});
```

## Struttura Dati

### Post Payload
```typescript
interface PostPayload {
  id: string;
  text: string;
  media?: string | null;  // CID IPFS
  authorPub: string;
  timestamp: number;
  replyTo?: string | null;
}
```

### Post con Autore
```typescript
interface PostWithAuthor extends Post {
  authorProfile?: {
    displayName?: string;
    avatarCid?: string | null;
    bio?: string;
  };
}
```

## Differenze con l'Implementazione Base

| Caratteristica | Implementazione Base | Protocol V2 |
|---------------|---------------------|-------------|
| Timeline | Singolo nodo `posts` | Organizzata per data `timeline/YYYY-MM-DD` |
| Profili | Caricati ogni volta | Cache locale |
| Hashtag | Non indicizzati | Indice automatico |
| Threading | Base | Migliorato con riferimenti |
| User Space | Solo globale | User Space + Discovery |
| Performance | Carica tutti i post | Carica per data (più efficiente) |

## Migrazione

Per migrare dal sistema base al Protocol V2:

1. **Sostituisci `usePosts` con `useSocialProtocol`**:
   ```typescript
   // Prima
   const { posts, createPost } = usePosts();
   
   // Dopo
   const { posts, publishPost, viewGlobalTimeline } = useSocialProtocol();
   ```

2. **Aggiorna la creazione dei post**:
   ```typescript
   // Prima
   await createPost('Testo');
   
   // Dopo
   await publishPost('Testo');
   ```

3. **Usa `TimelineV2` invece di `Timeline`**:
   ```typescript
   import { TimelineV2 } from './components/TimelineV2';
   
   // Nel tuo componente
   <TimelineV2 />
   ```

## Componenti Disponibili

### `TimelineV2`
Componente completo che usa il Protocol V2. Include:
- Composer per nuovi post
- Visualizzazione timeline
- Supporto hashtag
- Indicatori di stato

```typescript
import { TimelineV2 } from './components/TimelineV2';

<TimelineV2 />
```

## Estensioni Future

### IPFS Integration
Il metodo `uploadMedia` è preparato per l'integrazione IPFS:

```typescript
// Nel file socialProtocol.ts, sostituisci:
async uploadMedia(fileBlob: Blob): Promise<string> {
  // Implementa qui l'upload IPFS reale
  const ipfs = await IPFS.create();
  const result = await ipfs.add(fileBlob);
  return result.cid.toString();
}
```

### Ricerca Avanzata
Aggiungi funzionalità di ricerca:

```typescript
// Esempio futuro
searchPosts(query: string, callback: (post: PostWithAuthor) => void)
searchUsers(query: string, callback: (user: UserProfile) => void)
```

## Best Practices

1. **Sempre fare cleanup dei listener**:
   ```typescript
   useEffect(() => {
     const cleanup = network.viewGlobalTimeline(callback);
     return cleanup; // Importante!
   }, []);
   ```

2. **Usa la cache dei profili**:
   - Il sistema gestisce automaticamente la cache
   - Chiama `clearProfilesCache()` solo se necessario

3. **Gestisci gli errori**:
   ```typescript
   const result = await publishPost('Testo');
   if (!result.success) {
     console.error('Errore:', result.error);
   }
   ```

4. **Ottimizza la timeline**:
   - Carica solo i giorni necessari
   - Implementa paginazione per grandi volumi

## Supporto

Per domande o problemi, consulta:
- Codice sorgente: `src/utils/socialProtocol.ts`
- Hook React: `src/hooks/useSocialProtocol.ts`
- Componente esempio: `src/components/TimelineV2.tsx`

