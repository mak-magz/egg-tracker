<script setup lang="ts">
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'

definePageMeta({
  alias: ['/login/admin'],
  layout: false,
  auth: 'public',
})

useHead({
  title: 'Operator Sign In · Tamago Control Plane',
})

const route = useRoute()
const router = useRouter()
const auth = useFirebaseAuth()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const errorMessage = ref<string | null>(null)

// If already signed in as admin, redirect to /admin
onMounted(async () => {
  if (auth?.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken()
      await $fetch('/api/admin/metrics', {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      // If probe succeeds, user is already an admin
      await router.replace((route.query.redirect as string) || '/admin')
    }
    catch {
      // Not an admin or expired; stay on login page
    }
  }
})

async function handleLogin() {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please enter both email and password.'
    return
  }

  submitting.value = true
  errorMessage.value = null

  try {
    if (!auth) {
      throw new Error('Authentication service not initialized.')
    }

    // 1. Authenticate with Firebase Web SDK
    let idToken = ''
    try {
      const cred = await signInWithEmailAndPassword(auth, email.value.trim(), password.value)
      idToken = await cred.user.getIdToken(true)
    }
    catch (e: unknown) {
      const code = (e as { code?: string })?.code || ''
      if (
        code === 'auth/invalid-credential'
        || code === 'auth/user-not-found'
        || code === 'auth/wrong-password'
        || code === 'auth/invalid-email'
      ) {
        errorMessage.value = 'Invalid email or password.'
      }
      else if (code === 'auth/too-many-requests') {
        errorMessage.value = 'Too many failed attempts. Please try again later.'
      }
      else {
        errorMessage.value = 'Authentication failed. Please check your credentials.'
      }
      submitting.value = false
      return
    }

    // 2. Authorize via dedicated Admin Login endpoint
    try {
      await $fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: { idToken },
      })
    }
    catch (e: unknown) {
      // If server returns 403, this Firebase user is NOT an admin
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 403) {
        // Sign out immediately to purge non-admin session
        const signingOut = useState('auth:signingOut', () => false)
        signingOut.value = true
        try {
          await firebaseSignOut(auth)
        }
        finally {
          signingOut.value = false
        }
        errorMessage.value = 'Access denied: This account does not have administrator privileges.'
      }
      else {
        errorMessage.value = 'Unable to verify administrator permissions. Please try again.'
      }
      submitting.value = false
      return
    }

    // 3. Reset accessDenied state and navigate to target route
    const admin = useAdmin()
    admin.accessDenied.value = false
    const target = (route.query.redirect as string) || '/admin'
    await router.replace(target)
  }
  catch {
    errorMessage.value = 'An unexpected error occurred. Please try again.'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-amber-500/20 selection:text-amber-300 relative overflow-hidden">
    <!-- Ambient background glow -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      <div class="absolute -top-40 -left-40 size-96 bg-amber-500/10 rounded-full blur-3xl" />
      <div class="absolute top-1/2 -right-40 size-96 bg-amber-600/5 rounded-full blur-3xl" />
    </div>

    <!-- Header -->
    <header class="border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl shadow-inner select-none">
          🍳
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-white tracking-tight">Tamago Control Plane</span>
            <span class="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              System Online
            </span>
          </div>
          <p class="text-xs text-zinc-400">
            Fleet & Database Administration
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/login"
          class="text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60"
        >
          <span>Farm Tracker</span>
          <span class="text-zinc-500">→</span>
        </NuxtLink>
      </div>
    </header>

    <!-- Main Container -->
    <main class="flex-1 flex items-center justify-center p-4 sm:p-8">
      <div class="w-full max-w-md">
        <!-- Shield Badge Header -->
        <div class="text-center mb-6">
          <div class="inline-flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3 shadow-lg shadow-amber-500/5">
            <UIcon
              name="i-lucide-shield-check"
              class="size-7"
            />
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-white">
            Operator Sign In
          </h1>
          <p class="text-sm text-zinc-400 mt-1">
            Authorized platform operators and administrators only
          </p>
        </div>

        <!-- Auth Card -->
        <div class="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
          <!-- Error Alert Banner -->
          <div
            v-if="errorMessage"
            class="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3"
          >
            <UIcon
              name="i-lucide-alert-triangle"
              class="size-5 text-rose-400 shrink-0 mt-0.5"
            />
            <div class="text-xs leading-relaxed">
              <span class="font-semibold block text-rose-200 mb-0.5">Access Denied</span>
              {{ errorMessage }}
            </div>
          </div>

          <!-- Form -->
          <form
            class="space-y-4"
            @submit.prevent="handleLogin"
          >
            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">Operator Email</label>
              <div class="relative">
                <input
                  v-model="email"
                  type="email"
                  required
                  autocomplete="username"
                  autofocus
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                  placeholder="operator@tamago.farm"
                >
                <div class="absolute right-3 top-2.5 text-zinc-500 pointer-events-none">
                  <UIcon
                    name="i-lucide-mail"
                    class="size-5"
                  />
                </div>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">Password</label>
                <span class="text-[11px] text-zinc-500">Operator credentials</span>
              </div>
              <div class="relative">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  autocomplete="current-password"
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                  placeholder="••••••••••••"
                >
                <button
                  type="button"
                  class="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
                  @click="showPassword = !showPassword"
                >
                  <UIcon
                    :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    class="size-5"
                  />
                </button>
              </div>
            </div>

            <!-- Submit Button -->
            <button
              type="submit"
              :disabled="submitting"
              class="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span v-if="!submitting">Sign In to Control Plane</span>
              <span v-else>Verifying Operator Permissions...</span>
              <UIcon
                v-if="!submitting"
                name="i-lucide-arrow-right"
                class="size-4"
              />
              <UIcon
                v-else
                name="i-lucide-loader-2"
                class="size-4 animate-spin"
              />
            </button>
          </form>

          <!-- Security Footnote -->
          <div class="mt-6 pt-5 border-t border-zinc-800/80 flex items-center gap-2 text-xs text-zinc-500 justify-center">
            <UIcon
              name="i-lucide-lock"
              class="size-4 text-emerald-500/80"
            />
            <span>Guarded by CSRF origin verification & session cookie minting</span>
          </div>
        </div>

        <!-- Footer switch link -->
        <div class="mt-6 text-center text-xs text-zinc-500">
          Looking for daily barn entry?
          <NuxtLink
            to="/login"
            class="text-amber-400 hover:text-amber-300 font-medium underline underline-offset-4 ml-1"
          >
            Farm Owner Sign In
          </NuxtLink>
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-zinc-800/60 py-4 text-center text-xs text-zinc-600">
      Tamago Operator Control Plane · Database-per-tenant fleet architecture
    </footer>
  </div>
</template>
