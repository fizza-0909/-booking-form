import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "./mongodb";
import { compare } from "bcryptjs";
import { User } from "@/models/User";
import dbConnect from "./mongoose";

// Extend the default session type
declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            email: string;
            name: string;
            firstName: string;
            lastName: string;
        }
    }
}

// Extend the default JWT token type
declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        email: string;
        name: string;
        firstName: string;
        lastName: string;
    }
}

if (!process.env.NEXTAUTH_SECRET) {
    throw new Error('Please define NEXTAUTH_SECRET environment variable');
}

export const authOptions: NextAuthOptions = {
    adapter: MongoDBAdapter(clientPromise),
    secret: process.env.NEXTAUTH_SECRET,
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        updateAge: 24 * 60 * 60, // 24 hours
    },
    pages: {
        signIn: "/login",
        error: "/login",
    },
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            if (user) {
                // Initial sign in
                token.id = user.id;
                token.email = user.email;
                token.firstName = user.firstName;
                token.lastName = user.lastName;
                token.name = `${user.firstName} ${user.lastName}`;
            }

            // Handle updates to the session
            if (trigger === "update" && session) {
                return { ...token, ...session.user };
            }

            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id;
                session.user.email = token.email;
                session.user.firstName = token.firstName;
                session.user.lastName = token.lastName;
                session.user.name = token.name;
            }
            return session;
        }
    },
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                try {
                    console.log('Starting authorization process...');
                    await dbConnect();

                    if (!credentials?.email || !credentials?.password) {
                        console.log('Missing credentials');
                        throw new Error("Please enter both email and password");
                    }

                    console.log('Looking up user:', credentials.email);
                    const user = await User.findOne({
                        email: credentials.email.toLowerCase().trim()
                    }).select('+password');

                    if (!user) {
                        console.log('User not found');
                        throw new Error("Invalid email or password");
                    }

                    console.log('Comparing passwords...');
                    const isValid = await compare(
                        credentials.password,
                        user.password
                    );

                    if (!isValid) {
                        console.log('Invalid password');
                        throw new Error("Invalid email or password");
                    }

                    console.log('Authorization successful');
                    return {
                        id: user._id.toString(),
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        name: `${user.firstName} ${user.lastName}`
                    };
                } catch (error) {
                    console.error('Authorization error:', error);
                    throw error;
                }
            }
        })
    ],
    debug: process.env.NODE_ENV === 'development'
}; 