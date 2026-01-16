import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
// Import the getDb function and the v8-compatible firestore object
import { getDb, firestore } from './firebase';

// Initialize the database instance once
const db = getDb();


// --- GEMINI API SETUP ---
const geminiApiKey = process.env.API_KEY;
if (!geminiApiKey) {
    console.error("GEMINI_API_KEY is not set! Please set the GEMINI_API_KEY environment variable.");
}
const ai = new GoogleGenAI({ apiKey: geminiApiKey || '' });

// --- RESPONSIVE HOOK ---
const useMediaQuery = (query: string) => {
    const [matches, setMatches] = React.useState(
        () => window.matchMedia(query).matches
    );

    React.useEffect(() => {
        const mediaQueryList = window.matchMedia(query);
        const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
        mediaQueryList.addEventListener('change', listener);
        return () => mediaQueryList.removeEventListener('change', listener);
    }, [query]);

    return matches;
};


// --- TYPE DEFINITIONS ---
interface User {
    uid: string;
    name: string;
    email?: string;
}
interface Book {
  id: string; // Google Books API ID
  title: string;
  authors: string[];
  publishedYear: string;
  pageCount: number;
  thumbnail: string;
  description: string;
  genre: string;
  submittedBy: { uid: string, name: string };
  note: string;
}

interface Submission extends Book {
    firestoreId: string; // Firestore document ID
    votes: number;
    createdAt: any; // Firestore Timestamp
    meetingTimestamp?: any; // Firestore Timestamp for meeting
    isScheduled?: boolean;
}

type UserVotes = { [bookId: string]: number };
type Page = 'login' | 'proposals' | 'propose' | 'submissions' | 'userVotes' | 'meetings' | 'accountSettings';
type AppPhase = 'submission' | 'voting' | 'default';

interface VoteCounts {
    upvotes: number;
    downvotes: number;
    total: number;
    remaining: number;
}


// --- APP CONFIGURATION ---
const AppConfig = {
    CURRENT_PHASE: 'default' as AppPhase //UPDATE TO 'submission', 'voting', or 'default'
};

const INVITE_CODE = '1052JT';
const MAX_VOTES = 10;
const MAX_SUBMISSIONS = 3;
const MAX_VOTES_PER_BOOK_UP = 3;
const MAX_VOTES_PER_BOOK_DOWN = -3;

// --- API HELPERS ---
async function getGeminiSummary(description: string): Promise<string> {
    if (!description || description.trim() === 'No description available.') {
        return 'No description available.';
    }
    if (!geminiApiKey) {
        console.error("Cannot get Gemini summary: API key is not configured");
        return description.length > 300 ? description.substring(0, 297) + '...' : description;
    }
    try {
        console.log("Calling Gemini API with key:", geminiApiKey ? geminiApiKey.substring(0, 10) + '...' : 'MISSING');
        console.log("Current origin:", window.location.origin);
        console.log("Current hostname:", window.location.hostname);
        const prompt = `Summarize this book description for a book club in 2-3 concise sentences. Description: "${description}"`;
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        return response.text.trim();
    } catch (error: any) {
        console.error("Failed to get summary from Gemini:", error);
        // Log more details about the error
        console.error("Error Details:", {
            hasApiKey: !!geminiApiKey,
            apiKeyLength: geminiApiKey?.length || 0,
            apiKeyPrefix: geminiApiKey ? geminiApiKey.substring(0, 10) + '...' : 'N/A',
            errorCode: error?.error?.code || error?.code,
            errorStatus: error?.error?.status || error?.status,
            errorMessage: error?.error?.message || error?.message,
            errorReason: error?.error?.details?.[0]?.reason,
            fullError: error
        });
        
        // If it's a 405 error, it means nginx is intercepting the request
        if (error?.error?.code === 405 || error?.code === 405) {
            console.error("405 Error: Request is being intercepted by nginx. This suggests the API request is going to the wrong URL.");
        }
        
        return description.length > 300 ? description.substring(0, 297) + '...' : description;
    }
}

async function searchGoogleBooks(title: string, author: string): Promise<Book | null> {
    if (!title) return null;
    try {
        let query = `intitle:${encodeURIComponent(title)}`;
        if (author) query += `+inauthor:${encodeURIComponent(author)}`;
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&printType=books`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const item = data.items[0];
            const volInfo = item.volumeInfo;
            return {
                id: item.id,
                title: volInfo.title || 'No Title',
                authors: volInfo.authors || ['Unknown Author'],
                publishedYear: volInfo.publishedDate ? volInfo.publishedDate.substring(0, 4) : 'N/A',
                pageCount: volInfo.pageCount || 0,
                thumbnail: volInfo.imageLinks?.thumbnail || 'https://via.placeholder.com/128x192.png?text=No+Cover',
                description: volInfo.description || 'No description available.',
                genre: volInfo.mainCategory || (volInfo.categories ? volInfo.categories[0] : 'Uncategorized'),
                submittedBy: { uid: '', name: '' },
                note: '',
            };
        }
        return null;
    } catch (error) {
        console.error("Failed to fetch from Google Books API:", error);
        return null;
    }
}

// --- SVG ICONS ---
const ThumbsUpIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a2 2 0 0 1 1.79 1.11L15 5.88Z"></path></svg>;
const ThumbsDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"></path><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a2 2 0 0 1-1.79-1.11L9 18.12Z"></path></svg>;
const BackIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>;
const ProposalsIcon = ({ active }: { active: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={'none'} stroke={'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;
const MySubmissionsIcon = ({ active }: { active: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>{active && <><path d="M12 11v4" /><path d="M10 13h4" /></>}</svg>;
const MeetingsIcon = ({ active }: { active: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>{active && <><path d="M12 14v4" /><path d="M10 16h4" /></>}</svg>;
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const AddToCalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="m9 16 2 2 4-4"></path></svg>;
const WarningIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--danger-color)'}}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>;
const SpinnerIcon = () => <svg width="18" height="18" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid" style={{ display: 'block' }}><circle cx="50" cy="50" fill="none" stroke="currentColor" strokeWidth="10" r="35" strokeDasharray="164.93361431346415 56.97787143782138"><animateTransform attributeName="transform" type="rotate" repeatCount="indefinite" dur="1s" values="0 50 50;360 50 50" keyTimes="0;1"></animateTransform></circle></svg>;
const InfoIcon = ({ size = 22, color = 'var(--text-light-color)' }: { size?: number, color?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const SuccessIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success-color)' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>;


// --- UI COMPONENTS ---

const Header = ({ title, user, onBack, titleAction, isUserMenuOpen = false, onUserIconClick = () => {}, onLogout = () => {}, voteCounts, onSeeVotes, onAccountSettings, activePage, setPage, isDesktop }: { title: string; user: User | null; onBack?: () => void; titleAction?: React.ReactNode; isUserMenuOpen?: boolean; onUserIconClick?: () => void; onLogout?: () => void; voteCounts?: VoteCounts; onSeeVotes?: () => void; onAccountSettings?: () => void; activePage?: Page; setPage?: (page: Page) => void; isDesktop?: boolean; }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const mainNavPages = useMemo(() => new Set(['proposals', 'meetings', 'submissions']), []);


    useEffect(() => {
        if (!isUserMenuOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onUserIconClick();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isUserMenuOpen, onUserIconClick]);

    return (
        <header style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 10, flexShrink: 0 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {onBack && <button onClick={onBack} style={{ background: 'none', border: 'none', marginRight: '16px', color: 'var(--text-color)' }}><BackIcon /></button>}
                {!onBack ? (
                    <img
                        src="https://storage.googleapis.com/ai-studio-bucket-944361216321-us-west1/Images/nomans-logo.png"
                        alt="No Man's Book Club logo"
                        style={{ height: '28px', width: 'auto' }}
                    />
                ) : (
                    <h1 style={{ fontSize: '1.15rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
                )}
            </div>
            
             {isDesktop && activePage && setPage && mainNavPages.has(activePage) && (
                <div className="desktop-nav">
                    <button className={`desktop-nav-button ${activePage === 'meetings' ? 'active' : ''}`} onClick={() => setPage('meetings')}>
                        <MeetingsIcon active={activePage === 'meetings'} />
                        <span>Meetings</span>
                    </button>
                    <button className={`desktop-nav-button ${activePage === 'proposals' ? 'active' : ''}`} onClick={() => setPage('proposals')}>
                        <ProposalsIcon active={activePage === 'proposals'} />
                        <span>Proposals</span>
                    </button>
                    <button className={`desktop-nav-button ${activePage === 'submissions' ? 'active' : ''}`} onClick={() => setPage('submissions')}>
                        <MySubmissionsIcon active={activePage === 'submissions'} />
                        <span>My Submissions</span>
                    </button>
                </div>
            )}

             <div style={{ flex: isDesktop ? 1 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                {titleAction}
                {user && (
                    <div ref={menuRef} style={{ position: 'relative' }}>
                        <button
                            onClick={onUserIconClick}
                            style={{
                                width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--light-background)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)', fontWeight: 'bold',
                                border: isUserMenuOpen ? '2px solid var(--primary-color)' : '2px solid transparent', padding: 0
                            }}
                            aria-label="User menu"
                            aria-haspopup="true"
                            aria-expanded={isUserMenuOpen}
                        >
                            {user.name.charAt(0).toUpperCase()}
                        </button>
                        {isUserMenuOpen && (
                             <div
                                style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 8px)',
                                    right: 0,
                                    backgroundColor: 'white',
                                    borderRadius: 'var(--border-radius)',
                                    boxShadow: 'var(--shadow)',
                                    border: '1px solid var(--border-color)',
                                    zIndex: 20,
                                    width: '240px',
                                    overflow: 'hidden'
                                }}
                                role="menu"
                             >
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                    <p style={{ fontWeight: 600, color: 'var(--text-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user.name}>{user.name}</p>
                                    {user.email && <p style={{ fontSize: '0.8rem', color: 'var(--text-light-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user.email}>{user.email}</p>}
                                </div>
                                <div style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    {voteCounts && (
                                        <div style={{ padding: '12px 16px 4px 16px' }}>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-light-color)' }}>
                                                Active votes: {voteCounts.upvotes} up, {voteCounts.downvotes} down
                                            </p>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-light-color)', marginTop: '4px' }}>
                                                <strong style={{ fontWeight: 600, color: 'var(--text-color)' }}>Votes remaining:</strong> {voteCounts.remaining}
                                            </p>
                                        </div>
                                    )}
                                    <button
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--light-background)'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                        onClick={onSeeVotes}
                                        style={{
                                            width: '100%',
                                            padding: voteCounts ? '8px 16px 12px 16px' : '12px 16px',
                                            background: 'none',
                                            color: 'var(--text-color)',
                                            textAlign: 'left',
                                            fontSize: '0.9rem',
                                        }}
                                        role="menuitem"
                                    >
                                        See My Votes
                                    </button>
                                </div>
                                 <button
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--light-background)'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={onAccountSettings}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: 'none',
                                        color: 'var(--text-color)',
                                        textAlign: 'left',
                                        fontSize: '0.9rem',
                                        borderTop: '1px solid var(--border-color)',
                                    }}
                                    role="menuitem"
                                >
                                    Account Settings
                                </button>
                                <button
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--light-background)'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={onLogout}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: 'none',
                                        color: 'var(--danger-color)',
                                        textAlign: 'left',
                                        fontSize: '0.9rem',
                                        borderTop: '1px solid var(--border-color)',
                                    }}
                                    role="menuitem"
                                >
                                    Log out
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
};

const BottomNav = ({ activePage, setPage }: { activePage: Page, setPage: (page: Page) => void }) => (
    <nav className="bottom-nav">
        <button className={activePage === 'meetings' ? 'active' : ''} onClick={() => setPage('meetings')}>
            <MeetingsIcon active={activePage === 'meetings'} />
            <span>Meetings</span>
        </button>
        <button className={activePage === 'proposals' ? 'active' : ''} onClick={() => setPage('proposals')}>
            <ProposalsIcon active={activePage === 'proposals'} />
            <span>Proposals</span>
        </button>
        <button className={activePage === 'submissions' ? 'active' : ''} onClick={() => setPage('submissions')}>
            <MySubmissionsIcon active={activePage === 'submissions'} />
            <span>My Submissions</span>
        </button>
    </nav>
);


// FIX: Explicitly type component with React.FC to ensure TypeScript correctly handles the 'key' prop for list rendering.
const BookCard: React.FC<{ book: Submission, onVote: (id: string, dir: 1 | -1) => void, userVote: number, isAdmin: boolean, onDelete: (id: string) => void, onSchedule: (id: string) => void, isVoting: boolean }> = ({ book, onVote, userVote, isAdmin, onDelete, onSchedule, isVoting }) => {
    const handleUpvote = () => onVote(book.firestoreId, 1);
    const handleDownvote = () => onVote(book.firestoreId, -1);

    const voteButtonStyles: React.CSSProperties = {
        width: '32px', height: '32px', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--light-background)',
        opacity: isVoting ? 0.5 : 1
    };

    return (
        <div style={{ backgroundColor: 'white', borderRadius: 'var(--border-radius)', boxShadow: 'var(--shadow)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ padding: '16px', display: 'flex', gap: '16px' }}>
                <img src={book.thumbnail} alt={`Cover of ${book.title}`} style={{ width: '70px', height: '105px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '4px' }}>{book.title}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light-color)', marginBottom: '8px' }}>by {book.authors.join(', ')}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-light-color)' }}>
                        {book.publishedYear} · {book.pageCount} pages · {book.genre}
                    </p>
                     <p style={{ fontSize: '0.95rem', marginTop: '12px', lineHeight: 1.5 }}>
                        {book.description?.replace(/\*\*/g, '')}
                    </p>
                </div>
            </div>
             {book.note && (
                <div style={{ margin: '0 16px', backgroundColor: 'var(--light-background)', padding: '12px', borderRadius: '8px', borderLeft: `3px solid var(--border-color)` }}>
                    <p style={{ fontStyle: 'italic', color: 'var(--text-light-color)', fontSize: '0.9rem' }}>"{book.note}"</p>
                </div>
            )}
            <div style={{ padding: '12px 16px', marginTop: book.note ? '12px' : 0, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-light-color)' }}>Submitted by {book.submittedBy.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={handleDownvote} disabled={isVoting} style={{...voteButtonStyles, color: userVote < 0 ? 'var(--danger-color)' : 'var(--text-light-color)'}}><ThumbsDownIcon /></button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{book.votes}</span>
                        <button onClick={handleUpvote} disabled={isVoting} style={{...voteButtonStyles, color: userVote > 0 ? 'var(--success-color)' : 'var(--text-light-color)'}}><ThumbsUpIcon /></button>
                    </div>
                     {isAdmin && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px', borderLeft: '1px solid var(--border-color)' }}>
                            <button onClick={() => onSchedule(book.firestoreId)} style={{ ...voteButtonStyles, color: book.meetingTimestamp ? 'var(--success-color)' : 'var(--primary-color)' }} aria-label="Schedule Meeting">
                                <CalendarIcon />
                            </button>
                            <button onClick={() => onDelete(book.firestoreId)} style={{ ...voteButtonStyles, color: 'var(--danger-color)' }} aria-label="Admin Delete">
                                <TrashIcon />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
};

// FIX: Explicitly type component with React.FC to ensure TypeScript correctly handles the 'key' prop for list rendering.
const MySubmissionCard: React.FC<{ book: Submission, onDelete: (id: string) => void, onUpdateNote: (id: string, note: string) => Promise<void> }> = ({ book, onDelete, onUpdateNote }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedNote, setEditedNote] = useState(book.note || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleEditClick = () => {
        setEditedNote(book.note || '');
        setIsEditing(true);
    };

    const handleCancel = () => {
        setIsEditing(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onUpdateNote(book.firestoreId, editedNote);
        setIsSaving(false);
        setIsEditing(false);
    };

    return (
        <div style={{ backgroundColor: 'white', borderRadius: 'var(--border-radius)', overflow: 'hidden', boxShadow: 'var(--shadow)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', padding: '16px', gap: '16px' }}>
                <img src={book.thumbnail} alt={`Cover of ${book.title}`} style={{ width: '70px', height: '105px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '4px' }}>{book.title}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-light-color)', marginBottom: '8px' }}>by {book.authors.join(', ')}</p>
                        </div>
                        <button onClick={() => onDelete(book.firestoreId)} disabled={isEditing} style={{ background: 'var(--light-background)', color: 'var(--danger-color)', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isEditing ? 0.5 : 1, flexShrink: 0 }} aria-label="Delete submission"><TrashIcon /></button>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-light-color)', marginBottom: '12px' }}>
                       {book.publishedYear} · {book.pageCount} pages · {book.genre}
                    </p>
                    <p style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
                        {book.description?.replace(/\*\*/g, '')}
                    </p>
                </div>
            </div>
            {/* Note section */}
            <div style={{ backgroundColor: 'var(--light-background)', padding: '12px 16px', borderTop: '1px solid var(--border-color)', position: 'relative'}}>
                {isEditing ? (
                    <div>
                        <textarea
                            value={editedNote}
                            onChange={e => setEditedNote(e.target.value)}
                            placeholder="Add a personal note..."
                            rows={4}
                            style={{
                                width: '100%',
                                fontSize: '0.9rem',
                                resize: 'vertical',
                                backgroundColor: 'white',
                                marginBottom: '12px'
                            }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button onClick={handleCancel} style={{ padding: '8px 16px', borderRadius: '8px', background: 'none', color: 'var(--text-light-color)' }}>Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', gap: '4px', opacity: isSaving ? 0.7 : 1 }}>
                                {isSaving && <SpinnerIcon />}
                                Save
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {book.note ? (
                            <p style={{ fontStyle: 'italic', color: 'var(--text-light-color)', fontSize: '0.9rem', paddingRight: '40px' }}>"{book.note}"</p>
                        ) : (
                            <p style={{ color: 'var(--text-light-color)', fontSize: '0.9rem', paddingRight: '40px' }}>No personal note added.</p>
                        )}
                        <button onClick={handleEditClick} style={{
                            position: 'absolute',
                            top: '50%',
                            right: '12px',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            color: 'var(--text-light-color)',
                            width: '36px', height: '36px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                         }} aria-label="Edit note"><PencilIcon /></button>
                    </>
                )}
            </div>
        </div>
    );
};

const ConfirmationModal = ({ title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel' }: { title: string, message: string, onConfirm: () => void, onCancel: () => void, confirmText?: string, cancelText?: string }) => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: 'var(--border-radius)', padding: '24px', textAlign: 'center', maxWidth: '320px', width: '100%', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'inline-block', padding: '12px', backgroundColor: 'var(--light-background)', borderRadius: '50%', marginBottom: '16px' }}>
                 <WarningIcon />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>{title}</h2>
            <p style={{ color: 'var(--text-light-color)', marginBottom: '24px', lineHeight: 1.6 }}>{message}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={onCancel} style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', background: 'var(--light-background)', color: 'var(--text-color)', fontWeight: 500 }}>
                    {cancelText}
                </button>
                <button onClick={onConfirm} style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', backgroundColor: 'var(--danger-color)', color: 'white', fontWeight: 500 }}>
                    {confirmText}
                </button>
            </div>
        </div>
    </div>
);


const Modal = ({ title, message, onClose, icon }: { title: string, message: string, onClose: () => void, icon?: React.ReactNode }) => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: 'var(--border-radius)', padding: '24px', textAlign: 'center', maxWidth: '320px', width: '100%', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'inline-block', padding: '12px', backgroundColor: 'var(--light-background)', borderRadius: '50%', marginBottom: '16px' }}>
                 {icon || <WarningIcon />}
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>{title}</h2>
            <p style={{ color: 'var(--text-light-color)', marginBottom: '24px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{message}</p>
            <button onClick={onClose} style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--primary-color)', color: 'white', fontWeight: 500, fontSize: '1rem' }}>
                OK
            </button>
        </div>
    </div>
);

const isSameDay = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

const Calendar = ({ selectedDate, onDateSelect }: { selectedDate: Date | null, onDateSelect: (date: Date) => void }) => {
    const [displayDate, setDisplayDate] = useState(selectedDate || new Date());
    const today = new Date();

    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const handlePrevMonth = () => setDisplayDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setDisplayDate(new Date(year, month + 1, 1));

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newMonth = parseInt(e.target.value, 10);
        setDisplayDate(new Date(displayDate.getFullYear(), newMonth, 1));
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newYear = parseInt(e.target.value, 10);
        setDisplayDate(new Date(newYear, displayDate.getMonth(), 1));
    };

    const dayCells = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        dayCells.push(<div key={`empty-prev-${i}`} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
        const isToday = isSameDay(date, today);

        let style: React.CSSProperties = {
            width: '36px', height: '36px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', borderRadius: '50%', color: 'var(--text-color)'
        };

        if (isSelected) {
            style.backgroundColor = 'var(--primary-color)';
            style.color = 'white';
            style.fontWeight = '600';
        } else if (isToday) {
            style.border = '1px solid var(--border-color)';
            style.fontWeight = '600';
            style.color = 'var(--primary-color)';
        }

        dayCells.push(
            <button key={day} onClick={() => onDateSelect(date)} style={style}>
                {day}
            </button>
        );
    }
    
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 8 }, (_, i) => currentYear - 2 + i); // 2 years back, 5 years forward

    const selectStyle: React.CSSProperties = {
        border: 'none',
        fontWeight: 600,
        backgroundColor: 'transparent',
        padding: '4px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '1rem',
        color: 'var(--text-color)',
    };
    
    const navButtonStyle: React.CSSProperties = {
        background: 'none',
        color: 'var(--text-color)',
        fontWeight: 'bold',
        fontSize: '1.2rem',
        padding: '0',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%'
    };


    return (
        <div style={{ padding: '12px', backgroundColor: 'var(--light-background)', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 8px' }}>
                <button onClick={handlePrevMonth} style={navButtonStyle}>&lt;</button>
                <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                    <select value={displayDate.getMonth()} onChange={handleMonthChange} style={selectStyle}>
                        {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select value={displayDate.getFullYear()} onChange={handleYearChange} style={selectStyle}>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <button onClick={handleNextMonth} style={navButtonStyle}>&gt;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: '4px', justifyItems: 'center' }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d} style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light-color)' }}>{d}</div>)}
                {dayCells}
            </div>
        </div>
    );
};


const ScheduleModal = ({ book, onClose, onSchedule, onUnschedule }: { book: Submission, onClose: () => void, onSchedule: (id: string, date: Date) => Promise<void>, onUnschedule: (id: string) => Promise<void> }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(() => book.meetingTimestamp?.toDate() ?? null);

    const handleDateSelect = (date: Date) => {
        setSelectedDate(currentDate => {
            const newDate = new Date(date);
            if (currentDate) {
                // Preserve time if it's already set
                newDate.setHours(currentDate.getHours());
                newDate.setMinutes(currentDate.getMinutes());
            }
            return newDate;
        });
    };

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.value) return;
        const [hours, minutes] = e.target.value.split(':').map(Number);
        setSelectedDate(currentDate => {
            const newDate = currentDate ? new Date(currentDate) : new Date(); // If no date, use today
            newDate.setHours(hours, minutes, 0, 0); // Set time precisely
            return newDate;
        });
    };

    const handleSave = async () => {
        if (!selectedDate) return;
        setIsSaving(true);
        await onSchedule(book.firestoreId, selectedDate);
        setIsSaving(false);
        onClose();
    };

    const handleUnschedule = async () => {
         if (window.confirm(`Are you sure you want to unschedule "${book.title}"?`)) {
            setIsSaving(true);
            await onUnschedule(book.firestoreId);
            setIsSaving(false);
            onClose();
         }
    };
    
    const pad = (num: number) => num.toString().padStart(2, '0');
    const timeValue = selectedDate ? `${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}` : '';

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: 'var(--border-radius)', padding: '24px', maxWidth: '380px', width: '100%', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>Schedule Meeting</h2>
                <p style={{ color: 'var(--text-light-color)', marginBottom: '16px' }}>{book.title}</p>

                <Calendar selectedDate={selectedDate} onDateSelect={handleDateSelect} />

                <div style={{ marginTop: '16px' }}>
                    <label htmlFor="meeting-time" style={{ fontWeight: 500, marginBottom: '8px', display: 'block' }}>Meeting Time</label>
                    <input
                        id="meeting-time"
                        type="time"
                        value={timeValue}
                        onChange={handleTimeChange}
                        style={{ width: '100%', fontSize: '1rem' }}
                    />
                </div>

                 <div style={{ display: 'flex', gap: '8px', marginTop: '24px', justifyContent: 'space-between', alignItems: 'center' }}>
                     {book.meetingTimestamp &&
                         <button onClick={handleUnschedule} disabled={isSaving} style={{ padding: '12px 16px', borderRadius: '8px', background: 'none', color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '8px', opacity: isSaving ? 0.7 : 1 }}>
                            Unschedule
                        </button>
                     }
                     <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                         <button onClick={onClose} style={{ padding: '12px 16px', borderRadius: '8px', background: 'var(--light-background)', color: 'var(--text-color)' }}>Cancel</button>
                        <button onClick={handleSave} disabled={!selectedDate || isSaving} style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', gap: '4px', opacity: (!selectedDate || isSaving) ? 0.7 : 1 }}>
                            {isSaving ? <SpinnerIcon /> : 'Save'}
                        </button>
                     </div>
                </div>
            </div>
        </div>
    );
};


// --- PAGE COMPONENTS ---

const LoginScreen = ({ onLogin, onSignUp }: { onLogin: (identifier: string, pass: string) => Promise<string | null>, onSignUp: (name: string, email: string, pass: string, code: string) => Promise<string | null> }) => {
    const [isSignUp, setIsSignUp] = useState(false);
    
    // Login state
    const [loginIdentifier, setLoginIdentifier] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    // SignUp state
    const [signUpName, setSignUpName] = useState('');
    const [signUpEmail, setSignUpEmail] = useState('');
    const [signUpPassword, setSignUpPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginIdentifier || !loginPassword || isLoading) return;
        setIsLoading(true);
        setError(null);
        const errorMessage = await onLogin(loginIdentifier.trim(), loginPassword.trim());
        if (errorMessage) {
            setError(errorMessage);
        }
        setIsLoading(false);
    };

    const handleSignUpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!signUpName || !signUpEmail || !signUpPassword || !inviteCode || isLoading) return;
        setIsLoading(true);
        setError(null);
        const errorMessage = await onSignUp(signUpName.trim(), signUpEmail.trim(), signUpPassword.trim(), inviteCode.trim());
        if (errorMessage) {
            setError(errorMessage);
        }
        setIsLoading(false);
    };

    const toggleMode = () => {
        setIsSignUp(!isSignUp);
        setError(null);
    };

    const titleText = isSignUp ? "Create an Account" : "Welcome Back";
    const subText = isSignUp ? "Join the club! You'll need an invite code." : "Please enter your details to log in.";

    const loginDisabled = !loginIdentifier.trim() || !loginPassword.trim() || isLoading;
    const signUpDisabled = !signUpName.trim() || !signUpEmail.trim() || !signUpPassword.trim() || !inviteCode.trim() || isLoading;

    const formInputStyles: React.CSSProperties = {
        width: '100%',
        padding: '16px',
        fontSize: '1rem',
        textAlign: 'center',
    };

    const formButtonStyles: React.CSSProperties = {
        width: '100%',
        padding: '16px',
        fontSize: '1rem',
        fontWeight: 600,
        color: 'white',
        backgroundColor: 'var(--primary-color)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', overflowY: 'auto' }}>

            <div style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
                <img
                    src="https://storage.googleapis.com/ai-studio-bucket-944361216321-us-west1/Images/nomans-logo.png"
                    alt="No Man's Book Club logo"
                    style={{ maxWidth: '240px', width: '100%', height: 'auto', marginBottom: '16px' }}
                />
                <img
                    src="https://storage.googleapis.com/ai-studio-bucket-944361216321-us-west1/Images/nomans-drawing.png"
                    alt="An illustration of people reading and discussing books."
                    style={{ maxWidth: '300px', width: '100%', height: 'auto', marginTop: '16px' }}
                />
            </div>

            <div style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '320px', paddingTop: '12px' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 }}>{titleText}</h2>
                <p style={{ color: 'var(--text-light-color)', marginTop: '8px', marginBottom: '24px' }}>{subText}</p>
                
                {isSignUp ? (
                    <form onSubmit={handleSignUpSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <input style={formInputStyles} type="text" value={signUpName} onChange={e => setSignUpName(e.target.value)} placeholder="First Name" required aria-label="First Name" />
                        <input style={formInputStyles} type="email" value={signUpEmail} onChange={e => setSignUpEmail(e.target.value)} placeholder="Email Address" required aria-label="Email Address" />
                        <input style={formInputStyles} type="password" value={signUpPassword} onChange={e => setSignUpPassword(e.target.value)} placeholder="Password" required aria-label="Password" />
                        <input style={formInputStyles} type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="Invite Code" required aria-label="Invite Code" />
                        <button type="submit" disabled={signUpDisabled} style={{...formButtonStyles, opacity: signUpDisabled ? 0.6 : 1, marginTop: '4px'}}>
                            {isLoading && <SpinnerIcon />}
                            Sign Up
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleLoginSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <input style={formInputStyles} type="text" value={loginIdentifier} onChange={e => setLoginIdentifier(e.target.value)} placeholder="Name or Email" required aria-label="Name or Email" />
                        <input style={formInputStyles} type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Password" required aria-label="Password" />
                        <button type="submit" disabled={loginDisabled} style={{...formButtonStyles, opacity: loginDisabled ? 0.6 : 1, marginTop: '4px' }}>
                            {isLoading && <SpinnerIcon />}
                            Log In
                        </button>
                    </form>
                )}

                {error && <p style={{ color: 'var(--danger-color)', marginTop: '16px', fontWeight: 500 }}>{error}</p>}
                
                <button onClick={toggleMode} style={{ background: 'none', color: 'var(--text-light-color)', marginTop: '24px' }}>
                    {isSignUp ? "Already have an account? " : "Don't have an account? "}
                    <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{isSignUp ? "Log in" : "Sign up"}</span>
                </button>
            </div>
        </div>
    );
};

const ProposeBookScreen = ({ onPropose, onBack, userSubmissionsCount, existingBookIds }: { onPropose: (book: Book, note: string) => Promise<void>, onBack: () => void, userSubmissionsCount: number, existingBookIds: Set<string> }) => {
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [debouncedTitle, setDebouncedTitle] = useState('');
    const [debouncedAuthor, setDebouncedAuthor] = useState('');
    const [searchResult, setSearchResult] = useState<Book | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedTitle(title);
            setDebouncedAuthor(author);
        }, 500);
        return () => clearTimeout(handler);
    }, [title, author]);

    useEffect(() => {
        if (debouncedTitle) {
            setIsLoading(true);
            setSearchResult(null);
            searchGoogleBooks(debouncedTitle, debouncedAuthor).then(book => {
                setSearchResult(book);
                setIsLoading(false);
            });
        } else {
            setSearchResult(null);
        }
    }, [debouncedTitle, debouncedAuthor]);

    const canSubmit = userSubmissionsCount < MAX_SUBMISSIONS;
    const isAlreadySubmitted = searchResult ? existingBookIds.has(searchResult.id) : false;

    const handleSubmit = async () => {
        if (searchResult && canSubmit && !isSubmitting && !isAlreadySubmitted) {
            setIsSubmitting(true);
            try {
                await onPropose(searchResult, note);
            } catch (error) {
                // The modal is shown by the parent component. We just need to stop loading.
                setIsSubmitting(false);
            }
        }
    };

    const handleScroll = () => {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
            activeElement.blur();
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Header title="Propose a book" user={null} onBack={onBack} />
            <div onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <div className="content-pane" style={{paddingTop: 0}}>
                    <p style={{ color: 'var(--text-light-color)', textAlign: 'center', marginBottom: '16px', paddingTop: '16px'}}>
                        You can propose up to {MAX_SUBMISSIONS} books. ({userSubmissionsCount}/{MAX_SUBMISSIONS})
                    </p>
                    <div style={{ position: 'relative', marginBottom: '12px' }}>
                        <input
                            type="search"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Search for a book title"
                            style={{ width: '100%', padding: '8px 12px 8px 36px' }}
                        />
                         <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light-color)' }}>🔍</span>
                    </div>
                    <div style={{ position: 'relative', marginBottom: '20px' }}>
                        <input
                            type="search"
                            value={author}
                            onChange={e => setAuthor(e.target.value)}
                            placeholder="Author (optional)"
                            style={{ width: '100%', padding: '8px 12px' }}
                        />
                    </div>

                    {isLoading && <p style={{ textAlign: 'center' }}>Searching...</p>}

                    {searchResult && (
                        <div style={{ backgroundColor: 'var(--app-background)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', padding: '16px', boxShadow: 'var(--shadow)' }}>
                            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                <img src={searchResult.thumbnail} alt={`Cover of ${searchResult.title}`} style={{ width: '100px', height: '150px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}/>
                            </div>
                            <h2 style={{ textAlign: 'center', fontSize: '1.2rem', fontWeight: 600, marginBottom: '4px' }}>{searchResult.title}</h2>
                            <p style={{ textAlign: 'center', color: 'var(--text-light-color)', marginBottom: '12px', fontSize: '0.95rem' }}>by {searchResult.authors.join(', ')}</p>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', color: 'var(--text-light-color)', marginBottom: '16px', fontSize: '0.85rem' }}>
                                <span>{searchResult.pageCount} pages</span> · <span>{searchResult.genre}</span>
                            </div>
                            <p style={{ fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '24px' }}>{searchResult.description}</p>
                             {isAlreadySubmitted && !isSubmitting && <p style={{color: 'var(--danger-color)', textAlign: 'center', fontWeight: 500, marginBottom: '16px'}}>This book has already been submitted.</p>}
                            <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>Add a personal note (optional)</h3>
                            <textarea
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder="e.g. I heard this book is great! It'll also be good for some spicy book club debate."
                                rows={3}
                                style={{
                                    width: '100%',
                                    fontSize: '1rem',
                                    resize: 'vertical',
                                    color: 'var(--text-color)'
                                 }}
                            />
                        </div>
                    )}
                </div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'white', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
                <div style={{maxWidth: '800px', margin: '0 auto'}}>
                    <button onClick={handleSubmit} disabled={!searchResult || !canSubmit || isSubmitting || isAlreadySubmitted} style={{
                        width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 600, color: 'white', backgroundColor: 'var(--primary-color)',
                        borderRadius: '12px', opacity: (!searchResult || !canSubmit || isSubmitting || isAlreadySubmitted) ? 0.6 : 1, marginBottom: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}>
                        {isSubmitting ? (
                            <>
                                <SpinnerIcon />
                                <span>Summarizing...</span>
                            </>
                        ) : (isAlreadySubmitted ? 'Already Submitted' : (canSubmit ? 'Propose Book' : 'Submission limit reached'))}
                    </button>
                    <button onClick={onBack} disabled={isSubmitting} style={{
                        width: '100%',
                        background: 'none',
                        color: 'var(--text-light-color)',
                        padding: '8px',
                        fontSize: '0.9rem',
                        opacity: isSubmitting ? 0.6 : 1,
                    }}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

const UserVotesContent = ({ userVotes, submissions, voteCounts, onResetVotes, onReturnToProposals }: { userVotes: UserVotes; submissions: Submission[]; voteCounts: VoteCounts; onResetVotes: () => void; onReturnToProposals: () => void; }) => {
    const votedBooks = useMemo(() => {
        const submissionMap = new Map(submissions.map(s => [s.firestoreId, s]));
        return Object.entries(userVotes)
            .map(([bookId, vote]) => {
                const book = submissionMap.get(bookId);
                if (!book || vote === 0) return null;
                return {
                    id: book.firestoreId,
                    title: book.title,
                    vote: vote,
                    isScheduled: book.isScheduled || false // Add flag for styling
                };
            })
            .filter((item): item is { id: string; title: string; vote: number; isScheduled: boolean } => item !== null)
            .sort((a, b) => {
                // Sort by: active books first, then by absolute vote value, then by title
                if (a.isScheduled !== b.isScheduled) {
                    return a.isScheduled ? 1 : -1;
                }
                const voteDiff = Math.abs(b.vote) - Math.abs(a.vote);
                if (voteDiff !== 0) return voteDiff;
                return a.title.localeCompare(b.title);
            });
    }, [userVotes, submissions]);

    if (votedBooks.length === 0) {
        return (
            <div style={{textAlign: 'center'}}>
                <p style={{ marginTop: '48px', color: 'var(--text-light-color)' }}>You haven't voted on any books yet.</p>
                <button
                    onClick={onReturnToProposals}
                    style={{
                        display: 'inline-block',
                        margin: '24px auto 0',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-light-color)',
                        fontSize: '0.9rem',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                    }}
                >
                    Return to proposals
                </button>
            </div>
        );
    }

    return (
        <div>
            {votedBooks.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border-color)', opacity: item.isScheduled ? 0.7 : 1 }}>
                    <div style={{ flex: 1, marginRight: '16px' }}>
                        <span style={{ color: 'var(--text-color)', fontSize: '0.95rem' }}>{item.title}</span>
                        {item.isScheduled && <div style={{ fontSize: '0.75rem', color: 'var(--text-light-color)', marginTop: '2px' }}>Meeting Scheduled</div>}
                    </div>
                    <span style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        color: 'white',
                        backgroundColor: item.vote > 0 ? 'var(--success-color)' : 'var(--danger-color)',
                        minWidth: '36px',
                        textAlign: 'center'
                    }}>
                        {item.vote > 0 ? `+${item.vote}` : item.vote}
                    </span>
                </div>
            ))}
            <div style={{ margin: '24px 16px 16px 16px', padding: '16px', backgroundColor: 'var(--light-background)', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-color)', textAlign: 'center' }}>Vote Summary</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light-color)', marginBottom: '4px' }}>Active Upvotes</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--success-color)' }}>{voteCounts.upvotes}</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light-color)', marginBottom: '4px' }}>Active Downvotes</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--danger-color)' }}>{voteCounts.downvotes}</div>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light-color)', marginBottom: '4px' }}>Total Used</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-color)' }}>{voteCounts.total}</div>
                    </div>
                     <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light-color)', marginBottom: '4px' }}>Remaining</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--primary-color)' }}>{voteCounts.remaining}</div>
                    </div>
                </div>
            </div>
            <div style={{ padding: '0 16px 24px 16px', textAlign: 'center' }}>
                <button
                    onClick={onResetVotes}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'none',
                        color: 'var(--danger-color)',
                        border: '1px solid var(--danger-color)',
                        fontWeight: 500,
                        fontSize: '0.9rem',
                        marginTop: '8px'
                    }}
                >
                    Reset All My Votes
                </button>
                 <button
                    onClick={onReturnToProposals}
                    style={{
                        display: 'inline-block',
                        margin: '16px auto 0',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-light-color)',
                        fontSize: '0.9rem',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                    }}
                >
                    Return to proposals
                </button>
            </div>
        </div>
    );
};

// FIX: Explicitly type component with React.FC to ensure TypeScript correctly handles the 'key' prop for list rendering.
const MeetingCard: React.FC<{ book: Submission, isAdmin: boolean, onSchedule: (id: string) => void, isPast: boolean }> = ({ book, isAdmin, onSchedule, isPast }) => {
    const meetingDate = book.meetingTimestamp?.toDate ? book.meetingTimestamp.toDate() : null;

    // Date parts for the calendar view
    const month = meetingDate ? meetingDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : 'TBD';
    const day = meetingDate ? meetingDate.getDate() : '-';
    const weekday = meetingDate ? meetingDate.toLocaleDateString('en-US', { weekday: 'long' }) : 'Date to be determined';
    const formattedTime = meetingDate ? meetingDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

    const handleAddToCalendar = () => {
        if (!meetingDate) return;

        const toGoogleISOString = (date: Date) => {
            return date.toISOString().replace(/-|:|\.\d{3}/g, '');
        };

        const startDate = new Date(meetingDate);
        const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

        const startTime = toGoogleISOString(startDate);
        const endTime = toGoogleISOString(endDate);

        const title = `No Man's Book Club - ${meetingDate.toLocaleDateString('en-US', { month: 'long' })}`;

        const detailsParts = [
            `Book: ${book.title}`,
            `Author: ${book.authors.join(', ')}`,
            `Book Details: ${book.genre}, ${book.pageCount} pages, published ${book.publishedYear}`,
            `Description: ${book.description?.replace(/\*\*/g, '')}`,
            `Submitted by: ${book.submittedBy.name}`
        ];
        if (book.note) {
            detailsParts.push(`Note added: ${book.note}`);
        }
        const details = detailsParts.join('\n\n');

        const location = "No Man's Art Gallery & de bar, Bos en Lommerweg 90, 1055 EC Amsterdam, Netherlands";
        const timezone = "Europe/Amsterdam"; // Handles CET/CEST

        const url = new URL('https://www.google.com/calendar/render');
        url.searchParams.set('action', 'TEMPLATE');
        url.searchParams.set('text', title);
        url.searchParams.set('dates', `${startTime}/${endTime}`);
        url.searchParams.set('details', details);
        url.searchParams.set('location', location);
        url.searchParams.set('ctz', timezone);

        window.open(url.toString(), '_blank', 'noopener,noreferrer');
    };

    return (
         <div style={{ backgroundColor: 'white', margin: '12px 0', borderRadius: 'var(--border-radius)', boxShadow: 'var(--shadow)', border: '1px solid var(--border-color)', overflow: 'hidden', opacity: isPast ? 0.7 : 1 }}>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            textAlign: 'center',
                            width: '52px',
                            flexShrink: 0,
                            overflow: 'hidden',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                         }}>
                            <div style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '2px 0', fontSize: '0.7rem', fontWeight: 600 }}>{month}</div>
                            <div style={{ padding: '4px 0', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-color)', backgroundColor: 'white' }}>{day}</div>
                        </div>
                        <div>
                            <h4 style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: '1rem' }}>{weekday}</h4>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <p style={{ color: 'var(--text-light-color)', fontSize: '0.85rem' }}>{formattedTime}</p>
                                {isAdmin && (
                                    <button onClick={() => onSchedule(book.firestoreId)} style={{ color: 'var(--text-light-color)', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Edit meeting date">
                                        <PencilIcon />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                     {meetingDate && !isPast && (
                        <button
                            onClick={handleAddToCalendar}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: 'var(--light-background)',
                                color: 'var(--primary-color)',
                                padding: '6px 12px',
                                borderRadius: '999px',
                                border: '1px solid var(--border-color)',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                            }}
                            title="Add to Google Calendar"
                        >
                            <AddToCalendarIcon />
                            <span>Add to Calendar</span>
                        </button>
                    )}
                </div>

                 <div style={{ display: 'flex', gap: '16px' }}>
                    <img src={book.thumbnail} alt={`Cover of ${book.title}`} style={{ width: '70px', height: '105px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '4px' }}>{book.title}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-light-color)', marginBottom: '4px' }}>by {book.authors.join(', ')}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-light-color)', marginTop: '4px' }}>
                            {book.publishedYear} · {book.pageCount} pages · {book.genre}
                        </p>
                    </div>
                </div>
                 <p style={{ fontSize: '0.95rem', marginTop: '-8px', lineHeight: 1.5 }}>
                    {book.description?.replace(/\*\*/g, '')}
                </p>
            </div>
             <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--light-background)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-light-color)' }}>Submitted by {book.submittedBy.name}</p>
             </div>
        </div>
    );
};

const MeetingsScreen = ({ submissions, isAdmin, onSchedule }: { submissions: Submission[], isAdmin: boolean, onSchedule: (id: string) => void }) => {
    const now = new Date();
    const scheduled = submissions
        .filter(s => s.meetingTimestamp?.toDate)
        .sort((a, b) => a.meetingTimestamp.toMillis() - b.meetingTimestamp.toMillis());

    const upcomingMeetings = scheduled.filter(s => s.meetingTimestamp.toDate() >= now);
    const pastMeetings = scheduled.filter(s => s.meetingTimestamp.toDate() < now).reverse(); // show most recent past meeting first

    const groupMeetingsByMonth = (meetings: Submission[]) => {
        return meetings.reduce((acc, book) => {
            const date = book.meetingTimestamp.toDate();
            // Use a consistent format for the key e.g., "November 2024"
            const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            if (!acc[monthYear]) {
                acc[monthYear] = [];
            }
            acc[monthYear].push(book);
            return acc;
        }, {} as Record<string, Submission[]>);
    };

    const upcomingByMonth = groupMeetingsByMonth(upcomingMeetings);
    const pastByMonth = groupMeetingsByMonth(pastMeetings);

    return (
        <div style={{ minHeight: '100%' }}>
            <div style={{ padding: '0 0 8px 0' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Upcoming Meetings</h2>
            </div>
            {Object.keys(upcomingByMonth).length > 0 ? (
                Object.entries(upcomingByMonth).map(([monthYear, booksInMonth]) => (
                    <div key={monthYear}>
                        <h3 style={{
                            padding: '8px 0',
                            color: 'var(--text-color)',
                            fontWeight: 600,
                            fontSize: '1rem',
                            marginTop: '16px'
                        }}>{monthYear}</h3>
                        {booksInMonth.map(book => <MeetingCard key={book.firestoreId} book={book} isAdmin={isAdmin} onSchedule={onSchedule} isPast={false} />)}
                    </div>
                ))
            ) : (
                <p style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-light-color)' }}>No upcoming meetings have been scheduled yet.</p>
            )}

            <div style={{ padding: '24px 0 8px 0', borderTop: '1px solid var(--border-color)', marginTop: '24px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Past Meetings</h2>
            </div>
            {Object.keys(pastByMonth).length > 0 ? (
                Object.entries(pastByMonth).map(([monthYear, booksInMonth]) => (
                    <div key={monthYear}>
                        <h3 style={{
                            padding: '8px 0',
                            color: 'var(--text-color)',
                            fontWeight: 600,
                            fontSize: '1rem',
                             marginTop: '16px'
                        }}>{monthYear}</h3>
                        {booksInMonth.map(book => <MeetingCard key={book.firestoreId} book={book} isAdmin={isAdmin} onSchedule={onSchedule} isPast={true} />)}
                    </div>
                ))
            ) : (
                <p style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-light-color)' }}>No meetings have happened yet.</p>
            )}
        </div>
    );
};

const AccountSettingsScreen = ({ user, onUpdateUser, showModal, onReturnToProposals }: { user: User, onUpdateUser: (type: 'email' | 'password', payload: any) => Promise<string | null>, showModal: (info: any) => void, onReturnToProposals: () => void }) => {
    // State for email form
    const [newEmail, setNewEmail] = useState(user.email || '');
    const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
    const [isEmailSaving, setIsEmailSaving] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);

    // State for password form
    const [passCurrentPassword, setPassCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordSaving, setIsPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    
    const inputStyles: React.CSSProperties = {
        width: '100%',
        marginBottom: '12px'
    };
    
    const buttonStyles: React.CSSProperties = {
        padding: '12px 16px',
        width: '100%',
        borderRadius: '8px',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailError(null);
        if (!newEmail || !emailCurrentPassword) {
            setEmailError('All fields are required.');
            return;
        }
        setIsEmailSaving(true);
        const error = await onUpdateUser('email', { newEmail, currentPassword: emailCurrentPassword });
        setIsEmailSaving(false);
        if (error) {
            setEmailError(error);
        } else {
            showModal({ title: 'Success!', message: 'Your email has been updated.', icon: <SuccessIcon /> });
            setEmailCurrentPassword('');
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError(null);
        if (!passCurrentPassword || !newPassword || !confirmPassword) {
             setPasswordError('All fields are required.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match.');
            return;
        }
        setIsPasswordSaving(true);
        const error = await onUpdateUser('password', { newPassword, currentPassword: passCurrentPassword });
        setIsPasswordSaving(false);
        if (error) {
            setPasswordError(error);
        } else {
            showModal({ title: 'Success!', message: 'Your password has been updated.', icon: <SuccessIcon /> });
            setPassCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        }
    };
    
    const isEmailSaveDisabled = !newEmail || !emailCurrentPassword || isEmailSaving;
    const isPasswordSaveDisabled = !passCurrentPassword || !newPassword || !confirmPassword || isPasswordSaving;

    return (
        <div className="content-pane" style={{ paddingTop: '24px' }}>
             <div style={{ backgroundColor: 'white', borderRadius: 'var(--border-radius)', boxShadow: 'var(--shadow)', border: '1px solid var(--border-color)', padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>Change Email</h2>
                <p style={{ color: 'var(--text-light-color)', marginBottom: '16px', fontSize: '0.9rem' }}>Update the email address associated with your account.</p>
                <form onSubmit={handleEmailSubmit}>
                    <input style={inputStyles} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="New Email Address" required />
                    <input style={inputStyles} type="password" value={emailCurrentPassword} onChange={e => setEmailCurrentPassword(e.target.value)} placeholder="Current Password" required />
                    <button type="submit" style={{ ...buttonStyles, opacity: isEmailSaveDisabled ? 0.7 : 1 }} disabled={isEmailSaveDisabled}>
                        {isEmailSaving && <SpinnerIcon />}
                        Save Email
                    </button>
                    {emailError && <p style={{ color: 'var(--danger-color)', marginTop: '12px', textAlign: 'center' }}>{emailError}</p>}
                </form>
            </div>
            
             <div style={{ backgroundColor: 'white', borderRadius: 'var(--border-radius)', boxShadow: 'var(--shadow)', border: '1px solid var(--border-color)', padding: '24px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>Change Password</h2>
                <p style={{ color: 'var(--text-light-color)', marginBottom: '16px', fontSize: '0.9rem' }}>For your security, please choose a strong password.</p>
                <form onSubmit={handlePasswordSubmit}>
                    <input style={inputStyles} type="password" value={passCurrentPassword} onChange={e => setPassCurrentPassword(e.target.value)} placeholder="Current Password" required />
                    <input style={inputStyles} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Password" required />
                    <input style={inputStyles} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm New Password" required />
                    <button type="submit" style={{ ...buttonStyles, opacity: isPasswordSaveDisabled ? 0.7 : 1 }} disabled={isPasswordSaveDisabled}>
                        {isPasswordSaving && <SpinnerIcon />}
                        Save Password
                    </button>
                    {passwordError && <p style={{ color: 'var(--danger-color)', marginTop: '12px', textAlign: 'center' }}>{passwordError}</p>}
                </form>
            </div>
            <button
                onClick={onReturnToProposals}
                style={{
                    display: 'block',
                    margin: '24px auto 0',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-light-color)',
                    fontSize: '0.9rem',
                    textDecoration: 'underline',
                    cursor: 'pointer'
                }}
            >
                Return to proposals
            </button>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const App = () => {
    const [user, setUser] = useState<User | null>(() => {
        const savedUser = localStorage.getItem('bookClubUser');
        return savedUser ? JSON.parse(savedUser) : null;
    });
    const [page, setPage] = useState<Page>('proposals');
    const [submissions, setSubmissions] = useState<Submission[]>([]); // Source of truth from Firestore
    const [displayedSubmissions, setDisplayedSubmissions] = useState<Submission[]>([]); // For rendering with stable sorting
    const [userVotes, setUserVotes] = useState<UserVotes>({});
    const [modalInfo, setModalInfo] = useState<{title: string, message: string, icon?: React.ReactNode} | null>(null);
    const [confirmDeleteInfo, setConfirmDeleteInfo] = useState<{ firestoreId: string; title: string; } | null>(null);
    const [isResetVotesConfirmOpen, setIsResetVotesConfirmOpen] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [votingInProgress, setVotingInProgress] = useState<Set<string>>(new Set());
    const voteLockRef = useRef(new Set<string>()); // Synchronous lock to prevent race conditions
    const isFirstLoadRef = useRef(true);
    const submissionsRef = useRef(submissions);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [schedulingBook, setSchedulingBook] = useState<Submission | null>(null);
    const mainRef = useRef<HTMLElement>(null);
    const pageBeforeNav = useRef<Page>('proposals');
    submissionsRef.current = submissions;

    const isDesktop = useMediaQuery('(min-width: 768px)');

    const isAdmin = useMemo(() => user?.name === 'admin', [user]);

    const userVoteCounts = useMemo(() => {
        if (!user) {
            return { upvotes: 0, downvotes: 0, total: 0, remaining: MAX_VOTES };
        }

        // Create a set of active (unscheduled) proposal IDs for efficient lookup.
        const activeProposalIds = new Set(submissions.filter(s => !s.isScheduled).map(s => s.firestoreId));

        let upvotes = 0;
        let downvotes = 0;

        // Only count votes that are for active, unscheduled proposals.
        for (const bookId in userVotes) {
            if (activeProposalIds.has(bookId)) {
                const voteValue = userVotes[bookId];
                if (voteValue > 0) {
                    upvotes += voteValue;
                } else if (voteValue < 0) {
                    downvotes += Math.abs(voteValue);
                }
            }
        }
        const total = upvotes + downvotes;
        const remaining = Math.max(0, MAX_VOTES - total);
        return { upvotes, downvotes, total, remaining };
    }, [userVotes, user, submissions]); // Add submissions as a dependency

    // Helper function for sorting submissions
    const sortSubmissions = (subs: Submission[]) => {
        return subs.sort((a, b) => {
            const voteDiff = (b.votes || 0) - (a.votes || 0);
            if (voteDiff !== 0) return voteDiff;
            // If votes are tied, sort by most recent submission
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
        });
    };

    // Subscribe to real-time submission updates from Firestore
    useEffect(() => {
        const submissionsCol = firestore.collection(db, "submissions");
        const unsubscribe = firestore.onSnapshot(submissionsCol, (querySnapshot: any) => {
            const subs: Submission[] = [];
            querySnapshot.forEach((doc: any) => {
                subs.push({ firestoreId: doc.id, ...doc.data() } as Submission);
            });
            setSubmissions(subs);
            if (isConnecting) {
                setIsConnecting(false);
            }
        }, (error: any) => {
            console.error("Firestore subscription error:", error);
            setIsConnecting(false);
            setModalInfo({title: "Connection Error", message: "Could not retrieve book submissions. Please check your internet connection and refresh."})
        });
        return () => unsubscribe();
    }, [isConnecting]);

    // Subscribe to real-time vote updates for the current user
    useEffect(() => {
        if (!user) {
            setUserVotes({});
            return;
        };
        const userVotesDoc = firestore.doc(db, `userVotes/${user.name}`);
        const unsubscribe = firestore.onSnapshot(userVotesDoc, (doc: any) => {
            setUserVotes(doc.exists ? doc.data() : {});
        });
        return () => unsubscribe();
    }, [user]);

    // This effect sorts the list on first load. On subsequent updates, it checks if books were added/removed.
    useEffect(() => {
        if (isFirstLoadRef.current && submissions.length > 0) {
            setDisplayedSubmissions(sortSubmissions([...submissions]));
            isFirstLoadRef.current = false;
        } else if (!isFirstLoadRef.current) {
            setDisplayedSubmissions(currentDisplayed => {
                // If a book was added or removed, the list length will change.
                // In this case, we do a full re-sort to ensure the new state is reflected immediately.
                if (currentDisplayed.length !== submissions.length) {
                    return sortSubmissions([...submissions]);
                }

                // Otherwise (e.g. just a vote update), update items in place.
                // This prevents the list from re-ordering while a user is interacting with it.
                const subsMap = new Map(submissions.map(s => [s.firestoreId, s]));
                return currentDisplayed.map(d_sub => subsMap.get(d_sub.firestoreId) || d_sub);
            });
        }
    }, [submissions]);

    // This effect periodically re-sorts the displayed list from the source of truth.
    useEffect(() => {
        const intervalId = setInterval(() => {
            const sorted = sortSubmissions([...submissionsRef.current]);
            setDisplayedSubmissions(sorted);
        }, 30000);

        return () => clearInterval(intervalId);
    }, []);

    const userSubmissions = useMemo(() => submissions.filter(s => s.submittedBy.name?.toLowerCase() === user?.name?.toLowerCase() && !s.isScheduled).sort((a,b) => {
        const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return dateB - dateA;
    }), [submissions, user]);

    const existingBookIds = useMemo(() => new Set(submissions.map(s => s.id)), [submissions]);
    
    const proposals = useMemo(() => displayedSubmissions.filter(book => !book.isScheduled), [displayedSubmissions]);

    const [isScrolled, setIsScrolled] = useState(false);

    // Effect to reset scroll position whenever the page/tab changes
    useEffect(() => {
        if (mainRef.current) {
            mainRef.current.scrollTop = 0;
            // The scroll event may not fire on programmatic scroll, so reset the state manually.
            setIsScrolled(false);
        }
    }, [page]);

    const handleLogin = async (loginIdentifier: string, pass: string): Promise<string | null> => {
        const usersCol = firestore.collection(db, "users");

        try {
            const querySnapshot = await firestore.getDocs(usersCol);
            if (querySnapshot.empty) {
                return "User not found.";
            }

            let foundUserDoc: any = null;
            const lowercasedIdentifier = loginIdentifier.toLowerCase();

            for (const doc of querySnapshot.docs) {
                const userData = doc.data();
                const nameMatch = userData.name && userData.name.toLowerCase() === lowercasedIdentifier;
                const emailMatch = userData.email && userData.email.toLowerCase() === lowercasedIdentifier;
                if (nameMatch || emailMatch) {
                    foundUserDoc = doc;
                    break; // Found a user, exit loop
                }
            }

            if (!foundUserDoc) {
                return "User not found.";
            }

            const userData = foundUserDoc.data();

            if (userData.password !== pass) {
                return "Incorrect password.";
            }

            const loggedInUser: User = {
                uid: foundUserDoc.id,
                name: userData.name,
                email: userData.email
            };
            localStorage.setItem('bookClubUser', JSON.stringify(loggedInUser));
            setUser(loggedInUser);
            return null; // Success
        } catch (error) {
            console.error("Login error:", error);
            return "An error occurred during login.";
        }
    };

    const handleSignUp = async (name: string, email: string, pass: string, code: string): Promise<string | null> => {
        if (code.toUpperCase() !== INVITE_CODE.toUpperCase()) {
            return "Incorrect invite code.";
        }
    
        const usersCol = firestore.collection(db, "users");
        // Check if user with same name exists
        const nameQuery = firestore.query(usersCol, firestore.where("name", "==", name));
        const nameSnapshot = await firestore.getDocs(nameQuery);
        if (!nameSnapshot.empty) {
            return "A user with this name already exists.";
        }
        
        // Check if user with same email exists
        const emailQuery = firestore.query(usersCol, firestore.where("email", "==", email));
        const emailSnapshot = await firestore.getDocs(emailQuery);
        if (!emailSnapshot.empty) {
            return "A user with this email already exists.";
        }
    
        try {
            // SECURITY NOTE: Storing passwords in plaintext is highly insecure.
            // In a real application, use Firebase Authentication or hash passwords.
            const newUserDocRef = await firestore.addDoc(usersCol, {
                name,
                email,
                password: pass
            });
    
            const newUser: User = {
                uid: newUserDocRef.id,
                name,
                email
            };
            localStorage.setItem('bookClubUser', JSON.stringify(newUser));
            setUser(newUser);
            return null; // Success
        } catch (error) {
            console.error("Sign up error:", error);
            return "An error occurred during sign up.";
        }
    };


    const handleLogout = () => {
        localStorage.removeItem('bookClubUser');
        setUser(null);
        setIsUserMenuOpen(false);
    };

    const handleUserIconClick = () => {
        setIsUserMenuOpen(prev => !prev);
    };

    const handleSeeVotes = () => {
        pageBeforeNav.current = page;
        setPage('userVotes');
        setIsUserMenuOpen(false);
    };
    
    const handleAccountSettings = () => {
        pageBeforeNav.current = page;
        setPage('accountSettings');
        setIsUserMenuOpen(false);
    };

    const handleVote = async (firestoreId: string, direction: 1 | -1) => {
        // 1. Immediate synchronous lock
        if (!user || voteLockRef.current.has(firestoreId)) {
            return;
        }

        if (AppConfig.CURRENT_PHASE === 'submission') {
            setModalInfo({ title: "Voting isn't open yet.", message: "Voting will start once everyone has completed their submissions." });
            return;
        }
        
        // 2. Activate both locks
        voteLockRef.current.add(firestoreId);
        setVotingInProgress(prev => new Set(prev).add(firestoreId));
        
        const submissionRef = firestore.doc(db, `submissions/${firestoreId}`);
        const userVotesRef = firestore.doc(db, `userVotes/${user.name}`);

        try {
            await firestore.runTransaction(db, async (transaction: any) => {
                // Get latest data from server INSIDE the transaction
                const userVotesDoc = await transaction.get(userVotesRef);
                const serverUserVotes = userVotesDoc.exists ? userVotesDoc.data() : {};
                
                const submissionDoc = await transaction.get(submissionRef);
                if (!submissionDoc.exists) {
                    throw new Error("SUBMISSION_NOT_FOUND");
                }
                
                const currentVote = Number(serverUserVotes[firestoreId] || 0);
                const newVote = currentVote + direction;

                if (newVote > MAX_VOTES_PER_BOOK_UP) {
                    throw new Error("UPVOTE_LIMIT");
                }
                if (newVote < MAX_VOTES_PER_BOOK_DOWN) {
                    throw new Error("DOWNVOTE_LIMIT");
                }

                const currentTotalVotesUsed = Object.values(serverUserVotes).reduce((acc: number, vote: any) => acc + Math.abs(Number(vote) || 0), 0);
                // FIX: Explicitly cast currentTotalVotesUsed to a Number to resolve potential type inference issues.
                const newTotalVotesUsed = Number(currentTotalVotesUsed) - Math.abs(currentVote) + Math.abs(newVote);

                if (newTotalVotesUsed > MAX_VOTES) {
                    throw new Error("TOTAL_VOTES_LIMIT");
                }

                transaction.update(submissionRef, { 
                    votes: firestore.increment(direction)
                });

                const updatedUserVotes = { ...serverUserVotes, [firestoreId]: newVote };
                if (updatedUserVotes[firestoreId] === 0) {
                    delete updatedUserVotes[firestoreId];
                }
                transaction.set(userVotesRef, updatedUserVotes);
            });
        } catch (e: any) {
            console.error("Vote transaction failed: ", e.message);
            if (e.message === "UPVOTE_LIMIT") {
                setModalInfo({ title: "Upvote Limit Reached", message: `You can only upvote a single book a maximum of ${MAX_VOTES_PER_BOOK_UP} times.` });
            } else if (e.message === "DOWNVOTE_LIMIT") {
                setModalInfo({ title: "Downvote Limit Reached", message: `You can only downvote a single book a maximum of ${Math.abs(MAX_VOTES_PER_BOOK_DOWN)} times.` });
            } else if (e.message === "TOTAL_VOTES_LIMIT") {
                 setModalInfo({ title: "No Votes Left", message: `You have used all your ${MAX_VOTES} votes.` });
            } else if (e.message !== "SUBMISSION_NOT_FOUND") {
                setModalInfo({ title: "Error", message: "Your vote could not be saved. Please try again." });
            }
        } finally {
            // 3. Release both locks
            voteLockRef.current.delete(firestoreId);
            setVotingInProgress(prev => {
                const newSet = new Set(prev);
                newSet.delete(firestoreId);
                return newSet;
            });
        }
    };

    const handleGoToPropose = () => {
        pageBeforeNav.current = page;
        setPage('propose');
    };

    const handleAddBook = async (book: Book, note: string) => {
        if (!user) return;

        const submissionsCollectionRef = firestore.collection(db, "submissions");
        const q = firestore.query(submissionsCollectionRef, firestore.where("id", "==", book.id));
        const querySnapshot = await firestore.getDocs(q);
        if (!querySnapshot.empty) {
             setModalInfo({ title: "Already Submitted", message: "This book has already been submitted." });
             return Promise.reject();
        }

        const summarizedDescription = await getGeminiSummary(book.description);

        const newSubmission = {
            ...book,
            description: summarizedDescription,
            submittedBy: user,
            note,
            votes: 0,
            createdAt: firestore.serverTimestamp()
        };

        await firestore.addDoc(submissionsCollectionRef, newSubmission);
        setPage(pageBeforeNav.current);
    };

    const handleDeleteBook = (firestoreId: string) => {
        if (!isAdmin && !userSubmissions.some(s => s.firestoreId === firestoreId)) return;

        const bookToDelete = submissions.find(s => s.firestoreId === firestoreId);
        if (bookToDelete) {
            setConfirmDeleteInfo({
                firestoreId,
                title: bookToDelete.title
            });
        }
    };
    
    const executeDelete = async (firestoreId: string) => {
        const submissionRef = firestore.doc(db, `submissions/${firestoreId}`);
        const userVotesColRef = firestore.collection(db, 'userVotes');
        
        try {
            // Find all users who voted for this book
            const userVotesSnapshot = await firestore.getDocs(userVotesColRef);
            const affectedUserVoteRefs: any[] = [];
            userVotesSnapshot.forEach((doc: any) => {
                if (doc.data()[firestoreId]) {
                    affectedUserVoteRefs.push(doc.ref);
                }
            });

            await firestore.runTransaction(db, async (transaction: any) => {
                const submissionDoc = await transaction.get(submissionRef);
                if (!submissionDoc.exists) {
                    return; // Already deleted
                }

                // Read all affected user vote docs inside the transaction
                const userVoteDocs = await Promise.all(
                    affectedUserVoteRefs.map(ref => transaction.get(ref))
                );

                // Refund votes by removing the book entry
                userVoteDocs.forEach(userVoteDoc => {
                    if (userVoteDoc.exists) {
                        const currentVotes = userVoteDoc.data();
                        delete currentVotes[firestoreId];
                        transaction.set(userVoteDoc.ref, currentVotes);
                    }
                });

                // Finally, delete the submission
                transaction.delete(submissionRef);
            });
            
            if (schedulingBook?.firestoreId === firestoreId) {
                setSchedulingBook(null);
            }
            setConfirmDeleteInfo(null);
        } catch (error) {
            console.error("Failed to delete book and refund votes:", error);
            setModalInfo({ title: "Deletion Error", message: "Could not delete the book. Please try again." });
            setConfirmDeleteInfo(null);
        }
    };

    const handleResetAllVotes = async () => {
        if (!user) return;

        setIsResetVotesConfirmOpen(false); // Close modal immediately to give feedback

        const userVotesRef = firestore.doc(db, `userVotes/${user.name}`);

        try {
            await firestore.runTransaction(db, async (transaction: any) => {
                const userVotesDoc = await transaction.get(userVotesRef);
                if (!userVotesDoc.exists) {
                    return; // Nothing to do
                }

                const votesToReset: UserVotes = userVotesDoc.data();
                const bookIds = Object.keys(votesToReset);

                for (const bookId of bookIds) {
                    const voteValue = Number(votesToReset[bookId] || 0);
                    if (voteValue !== 0) {
                        const submissionRef = firestore.doc(db, `submissions/${bookId}`);
                        const submissionDoc = await transaction.get(submissionRef);
                        if (submissionDoc.exists) {
                            transaction.update(submissionRef, {
                                votes: firestore.increment(-voteValue)
                            });
                        }
                    }
                }
                transaction.delete(userVotesRef);
            });
            setModalInfo({ title: "Success!", message: "All your votes have been reset to 0." });
        } catch (error) {
            console.error("Failed to reset votes:", error);
            setModalInfo({ title: "Error", message: "Could not reset your votes. Please try again." });
        }
    };

    const handleUpdateNote = async (firestoreId: string, note: string) => {
        const submissionRef = firestore.doc(db, `submissions/${firestoreId}`);
        await firestore.setDoc(submissionRef, { note: note.trim() }, { merge: true });
    };

    const handleUpdateUser = async (type: 'email' | 'password', payload: any): Promise<string | null> => {
        if (!user) return "You must be logged in to do that.";

        const userRef = firestore.doc(db, `users/${user.uid}`);
        try {
            const userDoc = await firestore.getDocs(userRef); // getDocs on a doc ref is unusual but works with v8 compat
            if (!userDoc.exists) {
                return "User not found.";
            }
            const userData = userDoc.data();
            if (userData.password !== payload.currentPassword) {
                return "Incorrect current password.";
            }

            if (type === 'email') {
                const updatedData = { email: payload.newEmail };
                await firestore.setDoc(userRef, updatedData, { merge: true });
                const updatedUser = { ...user, email: payload.newEmail };
                setUser(updatedUser);
                localStorage.setItem('bookClubUser', JSON.stringify(updatedUser));
            } else if (type === 'password') {
                const updatedData = { password: payload.newPassword };
                await firestore.setDoc(userRef, updatedData, { merge: true });
            }
            
            return null; // Success
        } catch (error) {
            console.error("User update error:", error);
            return "An unexpected error occurred.";
        }
    };

    const handleScheduleClick = (firestoreId: string) => {
        const bookToSchedule = submissions.find(s => s.firestoreId === firestoreId);
        if(bookToSchedule) {
            setSchedulingBook(bookToSchedule);
        }
    };

    const handleScheduleMeeting = async (firestoreId: string, meetingDate: Date) => {
        const submissionRef = firestore.doc(db, `submissions/${firestoreId}`);
        
        try {
            await firestore.runTransaction(db, async (transaction: any) => {
                const submissionDoc = await transaction.get(submissionRef);
                if (!submissionDoc.exists) {
                    throw new Error("Submission not found");
                }

                // Simply update the submission to be scheduled and reset its public vote count.
                // We no longer remove votes from individual user documents to preserve vote history.
                transaction.update(submissionRef, {
                    meetingTimestamp: meetingDate,
                    votes: 0,
                    isScheduled: true,
                });
            });
        } catch (error) {
            console.error("Failed to schedule meeting:", error);
            setModalInfo({ title: "Scheduling Error", message: "Could not schedule the meeting. Please try again." });
        }
    };

    const handleUnscheduleMeeting = async (firestoreId: string) => {
        const submissionRef = firestore.doc(db, `submissions/${firestoreId}`);
        // When unscheduling, the book becomes a proposal again.
        // The votes remain at 0, and previous votes are not restored.
        await firestore.setDoc(submissionRef, {
            meetingTimestamp: null,
            isScheduled: false,
        }, { merge: true });
    };

    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        setIsScrolled(e.currentTarget.scrollTop > 20);
    };

    const handleInfoClick = () => {
        setModalInfo({
            title: "How Voting Works",
            message: "You have a total of 10 votes, including both up and down votes.\n\nYou can vote on a single book multiple times. However, you can only put up to 3 upvotes or downvotes on a single book.\n\nYou can see your vote count and which books you voted on by clicking your intiial in the top right corner.",
            icon: <InfoIcon size={48} color='var(--primary-color)' />
        });
    };

    if (isConnecting) {
        return <div style={{display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center'}}>Connecting to database...</div>
    }

    if (!user) {
        return <LoginScreen onLogin={handleLogin} onSignUp={handleSignUp} />;
    }

    if (page === 'propose') {
        const handlePropose = (book: Book, note: string) => {
            return handleAddBook(book, note);
        };
        return <ProposeBookScreen onPropose={handlePropose} onBack={() => setPage(pageBeforeNav.current)} userSubmissionsCount={userSubmissions.length} existingBookIds={existingBookIds} />;
    }

    const mainPages = new Set(['proposals', 'meetings', 'submissions']);
    let headerTitle;
    switch (page) {
        case 'userVotes':
            headerTitle = "My Votes";
            break;
        case 'accountSettings':
            headerTitle = "Account Settings";
            break;
        default:
            headerTitle = "No Man's Book Club";
    }

    const showBackButton = ['userVotes', 'accountSettings'].includes(page);


    const canPropose = (AppConfig.CURRENT_PHASE === 'submission' || AppConfig.CURRENT_PHASE === 'default') && userSubmissions.length < MAX_SUBMISSIONS;

    const headerAction = (
        <>
            {page === 'proposals' && (AppConfig.CURRENT_PHASE === 'voting' || AppConfig.CURRENT_PHASE === 'default') ? (
                <button onClick={handleInfoClick} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <InfoIcon />
                </button>
            ) : null}
            {isDesktop && page === 'submissions' && (
                <button
                    onClick={handleGoToPropose}
                    style={{
                        marginLeft: '16px',
                        padding: '8px 16px',
                        backgroundColor: 'var(--primary-color)',
                        color: 'white',
                        borderRadius: '8px',
                        fontWeight: 500,
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap'
                    }}>
                    + Submit Book
                </button>
            )}
        </>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {modalInfo && <Modal title={modalInfo.title} message={modalInfo.message} onClose={() => setModalInfo(null)} icon={modalInfo.icon} />}
            {confirmDeleteInfo && (
                <ConfirmationModal
                    title={`Delete "${confirmDeleteInfo.title}"?`}
                    message="Are you sure? This will delete the submission and remove any votes. This cannot be undone."
                    onConfirm={() => executeDelete(confirmDeleteInfo.firestoreId)}
                    onCancel={() => setConfirmDeleteInfo(null)}
                    confirmText="Delete"
                />
            )}
            {isResetVotesConfirmOpen && (
                <ConfirmationModal
                    title="Reset All Votes?"
                    message="Are you sure you want to remove all your votes? This will reset your vote count to 0 and cannot be undone."
                    onConfirm={handleResetAllVotes}
                    onCancel={() => setIsResetVotesConfirmOpen(false)}
                    confirmText="Reset Votes"
                />
            )}
            {isAdmin && schedulingBook && (
                <ScheduleModal
                    book={schedulingBook}
                    onClose={() => setSchedulingBook(null)}
                    onSchedule={handleScheduleMeeting}
                    onUnschedule={handleUnscheduleMeeting}
                />
            )}
            <Header
                title={headerTitle}
                user={user}
                onBack={showBackButton ? () => {
                    if (page === 'accountSettings') {
                        setPage('proposals');
                    } else {
                        setPage(pageBeforeNav.current);
                    }
                } : undefined}
                titleAction={headerAction}
                isUserMenuOpen={isUserMenuOpen}
                onUserIconClick={handleUserIconClick}
                onLogout={handleLogout}
                voteCounts={userVoteCounts}
                onSeeVotes={handleSeeVotes}
                onAccountSettings={handleAccountSettings}
                activePage={page}
                setPage={setPage}
                isDesktop={isDesktop}
            />
            
            <div className="app-body">
                {['proposals', 'meetings', 'submissions'].includes(page) && <BottomNav activePage={page} setPage={setPage} />}
                <main ref={mainRef} onScroll={handleScroll}>
                    {page === 'proposals' && (
                         <div className="card-grid">
                            {proposals.length > 0 ? proposals.map(book => (
                                <BookCard key={book.firestoreId} book={book} onVote={handleVote} userVote={userVotes[book.firestoreId] || 0} isAdmin={isAdmin} onDelete={handleDeleteBook} onSchedule={handleScheduleClick} isVoting={votingInProgress.has(book.firestoreId)} />
                            )) : (
                               <p style={{ textAlign: 'center', color: 'var(--text-light-color)', gridColumn: '1 / -1'}}>No submissions yet. Be the first!</p>
                            )}
                        </div>
                    )}
                     {page === 'meetings' && (
                        <div className="content-pane">
                            <MeetingsScreen submissions={submissions} isAdmin={isAdmin} onSchedule={handleScheduleClick} />
                        </div>
                     )}
                    {page === 'submissions' && (
                        <div className="content-pane">
                            {userSubmissions.length >= MAX_SUBMISSIONS && (
                                <div style={{ margin: '0 0 16px 0', padding: '12px', backgroundColor: 'var(--light-background)', borderRadius: '8px' }}>
                                     <p style={{ color: 'var(--text-light-color)', fontSize: '0.85rem', lineHeight: 1.4, textAlign: 'center' }}>
                                         You've reached your submission limit. To submit a new book, please delete one of your previous submissions.
                                     </p>
                                 </div>
                            )}
                            {userSubmissions.length > 0 ? (
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    {userSubmissions.map(book => (
                                        <MySubmissionCard key={book.firestoreId} book={book} onDelete={handleDeleteBook} onUpdateNote={handleUpdateNote} />
                                    ))}
                                </div>
                            ) : (
                                <p style={{ textAlign: 'center', marginTop: '48px', color: 'var(--text-light-color)'}}>You haven't submitted any books yet.</p>
                            )}
                        </div>
                    )}
                     {page === 'userVotes' && (
                        <div className="content-pane" style={{backgroundColor: 'white', padding: 0}}>
                            <UserVotesContent userVotes={userVotes} submissions={submissions} voteCounts={userVoteCounts} onResetVotes={() => setIsResetVotesConfirmOpen(true)} onReturnToProposals={() => setPage('proposals')} />
                        </div>
                     )}
                     {page === 'accountSettings' && (
                        <AccountSettingsScreen
                            user={user}
                            onUpdateUser={handleUpdateUser}
                            showModal={setModalInfo}
                            onReturnToProposals={() => setPage('proposals')}
                        />
                     )}
                </main>
            </div>

            {!isDesktop && page === 'submissions' && (
                <div className="propose-button-container">
                    <button onClick={handleGoToPropose} style={{
                        // Base styles that don't change or transition smoothly
                        position: 'absolute',
                        bottom: '16px',
                        height: '48px',
                        backgroundColor: 'var(--primary-color)',
                        boxShadow: 'var(--shadow)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 600,
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        // Explicit transitions
                        transition: 'width 0.25s ease-in-out, border-radius 0.25s ease-in-out, left 0.25s ease-in-out, transform 0.25s ease-in-out',
                        
                        // Conditional styles for the button container
                        ...(isScrolled 
                        ? { // FAB state
                            width: '48px',
                            borderRadius: '50%',
                            left: 'calc(100% - 16px)',
                            transform: 'translateX(-100%)',
                          } 
                        : { // Pill state
                            width: '165px',
                            borderRadius: '999px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                          })
                    }}>
                        {/* This inner div helps contain the two fading spans */}
                        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {/* FAB Content (+) */}
                            <span style={{
                                position: 'absolute',
                                opacity: isScrolled ? 1 : 0,
                                transition: 'opacity 0.15s ease-in-out',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <PlusIcon />
                            </span>

                            {/* Pill Content (+ Submit a Book) */}
                            <span style={{
                                position: 'absolute',
                                opacity: isScrolled ? 0 : 1,
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                                transition: 'opacity 0.15s ease-in-out 0.1s' // Delay appearance
                            }}>+ Submit a Book</span>
                        </div>
                    </button>
                </div>
            )}
        </div>
    );
};


const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}