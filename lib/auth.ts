import { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createOrUpdateUser, getUserByEmail } from '@/lib/db'

// Helper function to generate initials from email
function getInitialsFromEmail(email: string): string {
  if (!email) return "NA"
  
  const emailParts = email.split('@')[0]
  const nameParts = emailParts.split('.')
  
  if (nameParts.length >= 2) {
    return nameParts.map(part => part.charAt(0).toUpperCase()).join('')
  } else {
    return emailParts.charAt(0).toUpperCase() + (emailParts.charAt(1) || '').toUpperCase()
  }
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    // Remove signIn and error redirects to /login
    // signIn: '/login',
    // error: '/login',
  },
  callbacks: {
    async signIn({ user}) {
      try {
        console.log('SignIn attempt for:', user.email)
        
        if (!user.email) {
          console.log('No email provided')
          return false
        }

        // Validate email domain
        const allowedDomains = ['iitkgp.ac.in', 'kgpian.iitkgp.ac.in', 'gmail.com']
        const isValidDomain = allowedDomains.some(domain => 
          user.email?.endsWith(`@${domain}`) || false
        )
        
        if (!isValidDomain) {
          console.log('Rejected email (not IIT KGP):', user.email)
          return false
        }

        // Create or update user in database
        try {
          const userName = user.name || getInitialsFromEmail(user.email)
          
          await createOrUpdateUser({
            email: user.email,
            name: userName,
            image: user.image || null
          })
          
          console.log('User synced to database:', user.email)
        } catch (error) {
          console.error('User database sync failed:', error)
          // Don't block login if database sync fails
        }

        return true
      } catch (error) {
        console.error('Error during sign in:', error)
        return false
      }
    },
    async jwt({ token, user }) {
      if (user) {
        // On first sign in, fetch the DB user to get the correct id
        const dbUser = await getUserByEmail(user.email!)
        if (dbUser) {
          token.id = dbUser.id // This is the UUID from your DB
          token.email = dbUser.email
          token.name = dbUser.name ?? token.name
          token.picture = dbUser.image ?? token.picture
        } else {
          // fallback, unlikely but handle gracefully
          token.id = ""
        }
      }
      return token
    },
    async session({ session, token }) {
      try {
        if (token && session.user) {
          session.user.id = token.id as string
          session.user.email = token.email as string
          session.user.name = token.name as string
          session.user.image = token.picture as string
        }
        return session
      } catch (error) {
        console.error('Session callback error:', error)
        return session
      }
    },
  },
  events: {
    async signIn({ user }) {
      console.log('JWT login successful for:', user.email)
    },
    async signOut({ session, token }) {
      console.log('JWT logout for:', token?.email || session?.user?.email)
    },
  },
  debug: process.env.NODE_ENV === 'development',
}
