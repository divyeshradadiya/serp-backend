import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db/index";
import { users, sessions, accounts, verifications, organization as orgTable, member, invitation, workspaceCredits } from "./db/schema";
import { eq } from "drizzle-orm";
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export const auth = betterAuth({
  baseURL: process.env.BASE_URL || "http://localhost:3002",
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3002",
    process.env.FRONTEND_URL,
    process.env.BASE_URL,
  ].filter((url): url is string => Boolean(url)),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,    
      session: sessions,
      account: accounts,
      verification: verifications,
      organization: orgTable,
      member: member,
      invitation: invitation,
    },
  }),
  socialProviders: {
    ...(process.env.AUTH_GOOGLE_CLIENT_ID && process.env.AUTH_GOOGLE_CLIENT_SECRET && {
      google: {
        clientId: process.env.AUTH_GOOGLE_CLIENT_ID,
        clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET,
        // Remove redirectURI to use default backend URL
      },
    }),
    ...(process.env.AUTH_GITHUB_CLIENT_ID && process.env.AUTH_GITHUB_CLIENT_SECRET && {
      github: {
        clientId: process.env.AUTH_GITHUB_CLIENT_ID,
        clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET,
        // Remove redirectURI to use default backend URL
      },
    }),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24, // 1 day
    },
  },
  cookieOptions: {
    sameSite: "lax",
    secure: false,
    httpOnly: true,
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session, ctx) => {
          try {
            console.log(`🔍 Session created for user ${session.userId}`);

            // Check if user already has an organization
            const existingMembership = await db
              .select()
              .from(member)
              .where(eq(member.userId, session.userId))
              .then(rows => rows[0]);

            if (existingMembership) {
              console.log(`✅ User ${session.userId} already has an organization`);
              
              // Update session with active organization
              await db
                .update(sessions)
                .set({ 
                  activeOrganizationId: existingMembership.organizationId,
                  updatedAt: new Date()
                })
                .where(eq(sessions.id, session.id));
              
              // Check if the organization has workspace credits, create if not
              const existingCredits = await db
                .select()
                .from(workspaceCredits)
                .where(eq(workspaceCredits.organizationId, existingMembership.organizationId))
                .then(rows => rows[0]);

              if (!existingCredits) {
                await db
                  .insert(workspaceCredits)
                  .values({
                    organizationId: existingMembership.organizationId,
                    balance: 200,
                    totalPurchased: 200,
                    totalUsed: 0,
                    lastPurchase: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  });
                console.log(`💰 Starter credits (200) created for existing organization ${existingMembership.organizationId}`);
              }
              
              return;
            }

            // Get user details
            const user = await db
              .select()
              .from(users)
              .where(eq(users.id, session.userId))
              .then(rows => rows[0]);

            if (!user) {
              console.error(`❌ User ${session.userId} not found`);
              return;
            }

            console.log(`🏢 Creating organization for new user: ${user.email}`);

            // Create organization for new user
            const orgName = `${user.name || user.email.split('@')[0]}'s Workspace`;
            const orgSlug = `${user.email.split('@')[0]}-workspace-${Date.now()}`;

            const [newOrg] = await db
              .insert(orgTable)
              .values({
                id: crypto.randomUUID(),
                name: orgName,
                slug: orgSlug,
                metadata: { autoCreated: true },
                createdAt: new Date(),
              })
              .returning();

            if (newOrg) {
              // Add user as owner of the organization
              await db
                .insert(member)
                .values({
                  id: crypto.randomUUID(),
                  organizationId: newOrg.id,
                  userId: user.id,
                  role: "owner",
                  createdAt: new Date(),
                });

              // Update session with active organization
              await db
                .update(sessions)
                .set({ 
                  activeOrganizationId: newOrg.id,
                  updatedAt: new Date()
                })
                .where(eq(sessions.id, session.id));

              console.log(`✅ Organization "${newOrg.name}" created for user ${user.email}`);

              // Create workspace credits for the new organization (1000 starter credits)
              await db
                .insert(workspaceCredits)
                .values({
                  organizationId: newOrg.id,
                  balance: 1000,
                  totalPurchased: 1000,
                  totalUsed: 0,
                  lastPurchase: new Date(),
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });

              console.log(`💰 Starter credits (1000) created for organization ${newOrg.id}`);
            }
          } catch (error) {
            console.error('❌ Error creating organization:', error);
          }
        }
      }
    }
  },
  plugins: [
    nextCookies(),
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      cancelPendingInvitationsOnReInvite: true,
      membershipLimit: 100,
      async sendInvitationEmail(data) {
        const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/accept-invitation/${data.id}`;
        
        // TODO: Implement email sending
        console.log(`📧 Invitation email would be sent to ${data.email}`);
        console.log(`Invite link: ${inviteLink}`);
      },
    })
  ],
  secret: process.env.BETTER_AUTH_SECRET || "your-super-secret-key-here",
});

export type Session = typeof auth.$Infer.Session;