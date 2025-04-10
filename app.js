// --- Supabase ---
// Using your provided Supabase credentials
const SUPABASE_URL = 'https://ymujnnyssvybeontsuqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltdWpubnlzc3Z5YmVvbnRzdXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQyNTQ0NDksImV4cCI6MjA1OTgzMDQ0OX0.gH6BGAjCRNpyQIQrh7xpQfoqgqx7aJ6JlziqF5A3PRc';

// Ensure Supabase client is loaded before using it
if (!window.supabase) {
    console.error("Supabase client not loaded. Make sure the script tag is included.");
    alert("Error: Supabase client not found. The application cannot start.");
}
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM Elements ---
// General Nav
const loggedOutView = document.getElementById('logged-out-view');
const loggedInView = document.getElementById('logged-in-view');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const logoutButton = document.getElementById('logout-button');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');

// Modals
const loginModal = document.getElementById('login-modal');
const signupModal = document.getElementById('signup-modal');
const closeLoginModalButton = document.getElementById('close-login-modal-button');
const closeSignupModalButton = document.getElementById('close-signup-modal-button');
const closeLoginModalX = document.getElementById('close-login-modal-x');
const closeSignupModalX = document.getElementById('close-signup-modal-x');


// Forms
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const submitProjectForm = document.getElementById('submit-project-form'); // Present on submit.html

// Form Feedback / Messages
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const signupSuccess = document.getElementById('signup-success');
const submitError = document.getElementById('submit-error'); // Present on submit.html
const submitSuccess = document.getElementById('submit-success'); // Present on submit.html
const submitAuthMessage = document.getElementById('submit-auth-message'); // Present on submit.html
const submitProjectButton = document.getElementById('submit-project-button'); // Present on submit.html


// Project Display (index.html)
const projectGrid = document.getElementById('project-grid'); // Present on index.html
const loadingProjects = document.getElementById('loading-projects'); // Present on index.html

// --- State ---
let currentUser = null;
let userProfile = null;
let isLoadingProjects = false; // Prevent multiple loads

// --- Utility Functions ---
function showElement(el) {
    if (el) el.classList.remove('hidden');
}
function hideElement(el) {
    if (el) el.classList.add('hidden');
}
function displayMessage(el, message, isSuccess = false, duration = 4000) {
    if (el) {
        el.textContent = message;
        // Ensure correct text color classes are toggled
        el.classList.remove(isSuccess ? 'text-red-500' : 'text-green-600');
        el.classList.add(isSuccess ? 'text-green-600' : 'text-red-500');
        if (duration > 0) {
             setTimeout(() => { if(el.textContent === message) el.textContent = ''; }, duration); // Clear only if message hasn't changed
        }
    }
}

// Simple debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// --- Authentication ---
async function handleSignUp(event) {
    event.preventDefault();
    if (!signupForm) return;

    const usernameInput = document.getElementById('signup-username');
    const emailInput = document.getElementById('signup-email');
    const passwordInput = document.getElementById('signup-password');

    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    displayMessage(signupError, ''); // Clear previous errors
    displayMessage(signupSuccess, '', true);

    if (!username || !email || !password) {
        displayMessage(signupError, "Please fill in all fields.");
        return;
    }
     if (password.length < 6) {
        displayMessage(signupError, "Password must be at least 6 characters long.");
        return;
    }
    if (/\s/.test(username) || !/^[a-zA-Z0-9_]+$/.test(username)) {
         displayMessage(signupError, "Username can only contain letters, numbers, and underscores.");
         return;
     }

    try {
        // Check if username exists (ensure 'profiles' table allows anon read or user has select grant)
         // IMPORTANT: This check requires appropriate RLS on the 'profiles' table if enabled.
         // It might fail if RLS prevents reading profiles before login.
         // A safer alternative is to let the DB unique constraint handle it,
         // but this provides quicker feedback.
        const { data: existingProfile, error: checkError } = await supabase
             .from('profiles')
             .select('username', { count: 'exact' }) // Just check if any row matches
             .ilike('username', username); // Case-insensitive

        if (checkError) {
            // Don't block signup if the check fails (e.g., due to RLS), let the insert handle uniqueness
            console.warn("Could not pre-check username:", checkError.message);
        } else if (existingProfile && existingProfile.length > 0) {
            displayMessage(signupError, "Username already taken. Please choose another.");
            return;
        }

        // Proceed with signup
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            // Add username to metadata if needed, though we'll use the profiles table primarily
            // options: { data: { username: username } }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Signup successful, but no user data returned.");

        // Create profile *after* successful auth signup
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                username: username,
                updated_at: new Date().toISOString(),
            });

        if (profileError) {
            console.error("Profile creation error after signup:", profileError);
            // If profile insert fails (e.g., DB constraint on username), inform the user.
            // The auth user exists, but profile doesn't. This needs careful handling.
            if (profileError.message.includes('profiles_username_key')) {
                 displayMessage(signupError, `Account created, but username '${username}' is already taken. Please contact support or try logging in.`);
            } else {
                displayMessage(signupError, `Account created, but profile setup failed (${profileError.message}). Please contact support.`);
            }
             return; // Stop further processing
        }

        // Check if email confirmation is required in your Supabase settings
        if (authData.user.identities && authData.user.identities.length === 0) {
             displayMessage(signupSuccess, "Signup successful! Please check your email to verify your account.", true, 8000);
        } else {
            // If email confirmation is disabled or user already verified (unlikely on fresh signup)
             displayMessage(signupSuccess, "Signup successful!", true);
             // You might want to auto-login or refresh state here if no confirmation needed
             // supabase.auth.refreshSession(); // Potentially trigger auth state change
             hideElement(signupModal); // Close modal on success
        }
        signupForm.reset();
        // Don't hide modal immediately if email verification is needed

    } catch (error) {
        console.error("Signup error:", error);
        const message = error.message.includes('duplicate key value violates unique constraint') && error.message.includes('profiles_username_key')
            ? "Username already taken."
            : error.message.includes('User already registered')
            ? "An account with this email already exists."
            : error.message.includes('Password should be at least 6 characters')
            ? "Password must be at least 6 characters long."
            : `Signup failed: ${error.message || 'An unknown error occurred.'}`;
        displayMessage(signupError, message);
    }
}


async function handleLogin(event) {
    event.preventDefault();
     if (!loginForm) return;

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    displayMessage(loginError, '');

    if (!email || !password) {
        displayMessage(loginError, "Please enter email and password.");
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
             if (error.message === 'Email not confirmed') {
                throw new Error('Please verify your email address first.');
            } else if (error.message === 'Invalid login credentials') {
                 throw new Error('Incorrect email or password.');
            }
             throw error;
        }

        // Login successful, onAuthStateChange handles UI updates and closing modal
        console.log("Login successful for:", data.user?.email);
        loginForm.reset();
        hideElement(loginModal);


    } catch (error) {
        console.error("Login error:", error);
        displayMessage(loginError, `Login failed: ${error.message || 'Invalid credentials'}`);
    }
}


async function handleLogout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        // State updates and UI handled by onAuthStateChange listener
        console.log("User logged out successfully.");
    } catch (error) {
        console.error("Logout error:", error);
        alert(`Logout failed: ${error.message}`);
    }
}


// --- Profile Management ---
async function fetchUserProfile(userId) {
     if (!userId) {
         console.warn("fetchUserProfile called without userId");
         userProfile = null;
         updateUserUI();
         return;
     }
    console.log("Fetching profile for user:", userId);
    try {
        const { data, error, status } = await supabase
            .from('profiles')
            .select(`username, avatar_url`)
            .eq('id', userId)
            .single(); // Expect exactly one profile

        if (error) {
            if (status === 406 || (error.code && error.code === 'PGRST116')) {
                console.warn("No profile found in DB for user:", userId, "Maybe creation failed?");
                userProfile = { username: 'Profile Issue', avatar_url: null }; // Indicate an issue
            } else {
                throw error; // Rethrow other DB errors (RLS, connection, etc.)
            }
        } else if (data) {
            console.log("Profile found:", data.username);
            userProfile = data;
        } else {
             console.warn("Profile data unexpectedly null for user:", userId);
             userProfile = { username: 'Profile Error', avatar_url: null };
        }

    } catch (error) {
        console.error("Error fetching profile:", error);
        userProfile = null; // Reset on error
    } finally {
        updateUserUI(); // Update UI with fetched (or default/error) profile info
    }
}


// --- UI Updates ---
function updateUserUI() {
    if (currentUser) {
        showElement(loggedInView);
        hideElement(loggedOutView);
        if (userProfile && userProfile.username) {
            // Display username, handle potential missing profile cases gracefully
             const displayUsername = userProfile.username.startsWith('Profile') ? '(Profile Issue)' : userProfile.username;
            userInfo.textContent = `Hi, ${displayUsername}!`;
            userAvatar.textContent = displayUsername.charAt(0).toUpperCase();
            userAvatar.title = displayUsername;
             // TODO: Implement avatar image display if userProfile.avatar_url exists
        } else {
            // State while profile is loading or if it failed
            userInfo.textContent = 'Loading profile...';
            userAvatar.textContent = '?';
            userAvatar.title = 'Loading...';
        }
    } else {
        hideElement(loggedInView);
        showElement(loggedOutView);
        userInfo.textContent = '';
        userAvatar.textContent = '?';
        userAvatar.title = 'Not logged in';
    }

    // Handle UI specific to submit page authorization
    if (submitProjectForm && submitAuthMessage && submitProjectButton) {
         if (currentUser) {
             hideElement(submitAuthMessage);
             submitProjectButton.disabled = false;
             submitProjectForm.style.opacity = '1';
             submitProjectForm.querySelectorAll('input:not([type=button]), textarea').forEach(el => el.disabled = false);
         } else {
             showElement(submitAuthMessage);
             submitProjectButton.disabled = true;
             submitProjectForm.style.opacity = '0.6';
             submitProjectForm.querySelectorAll('input:not([type=button]), textarea').forEach(el => el.disabled = true);
         }
     } else if (window.location.pathname.includes('submit.html')) {
         console.warn("Submit form elements not found for UI update.");
     }
}

// --- Project Loading (index.html) ---
const loadProjects = debounce(async () => {
    if (!projectGrid || !loadingProjects || isLoadingProjects) return;

    console.log("Loading projects...");
    isLoadingProjects = true;
    showElement(loadingProjects);
    loadingProjects.textContent = "Loading projects...";
    loadingProjects.classList.remove('text-red-500');
    projectGrid.innerHTML = '';

    try {
        // Use the DB function (requires function exists in Supabase)
        const { data: projects, error } = await supabase.rpc('get_projects_with_details');

        if (error) throw error;

        hideElement(loadingProjects);

        if (projects && projects.length > 0) {
             console.log(`Loaded ${projects.length} projects.`);
            projects.forEach(project => {
                projectGrid.appendChild(createProjectCard(project));
            });
             // After loading, check user's votes to highlight buttons (optional enhancement)
            // if (currentUser) { await highlightUserVotes(projects.map(p => p.id)); }
        } else {
            console.log("No projects found.");
            projectGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10 text-lg">No projects found yet. Be the first to share!</p>';
        }

    } catch (error) {
        console.error("Error loading projects:", error);
        loadingProjects.textContent = `Failed to load projects: ${error.message}. Please try again later.`;
        loadingProjects.classList.add('text-red-500');
        showElement(loadingProjects);
        projectGrid.innerHTML = '';
    } finally {
        isLoadingProjects = false;
    }
}, 250);


function createProjectCard(project) {
    const div = document.createElement('div');
    div.className = "bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 flex flex-col";
    div.setAttribute('data-project-id', project.id);

    // --- Image Placeholder ---
    const imagePlaceholder = project.image_url
        ? `<img src="${project.image_url}" alt="${project.title || 'Project image'}" class="h-40 w-full object-cover">`
        : `<div class="h-40 bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center text-indigo-400">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 opacity-70">
                 <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
               </svg>
           </div>`;

    // --- Description ---
    const descriptionMaxLength = 110;
    const descriptionText = project.description || ''; // Handle null description
    const shortDescription = descriptionText.length > descriptionMaxLength
        ? descriptionText.substring(0, descriptionMaxLength).trim() + '...'
        : descriptionText;

    // --- Tags ---
    const tagsHtml = (project.tags && project.tags.length > 0)
        ? project.tags.slice(0, 4).map(tag =>
            `<span class="bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-0.5 rounded-full border border-gray-200">${tag.trim()}</span>`
          ).join(' ') + (project.tags.length > 4 ? ' <span class="text-xs text-gray-400">...</span>' : '')
        : '<span class="text-xs text-gray-400 italic">No tags</span>';

    // --- Voting Buttons ---
    // Base classes - state classes (like text-green-600 for voted up) will be added dynamically later if needed
    const voteButtonBaseClasses = "vote-button flex items-center space-x-1 text-gray-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150";
    const upvoteButtonClass = `${voteButtonBaseClasses} hover:text-green-600`;
    const downvoteButtonClass = `${voteButtonBaseClasses} hover:text-red-600`;

    // --- Final Card HTML ---
    div.innerHTML = `
        ${imagePlaceholder}
        <div class="p-5 flex-grow flex flex-col">
            <h3 class="text-xl font-semibold text-gray-800 mb-1 leading-tight group-hover:text-indigo-600 transition-colors duration-150">${project.title || 'Untitled Project'}</h3>
            <p class="text-sm text-gray-500 mb-3">by <a href="#" class="text-indigo-600 hover:underline font-medium">${project.author_username || 'Unknown User'}</a></p>
            <p class="text-gray-600 text-sm mb-4 flex-grow">${shortDescription || 'No description provided.'}</p>
            <div class="flex flex-wrap gap-2 mb-4">
                ${tagsHtml}
            </div>
            <div class="flex justify-between items-center text-sm text-gray-500 mt-auto pt-3 border-t border-gray-100">
                <div class="flex items-center space-x-4">
                    <button data-vote="up" class="${upvoteButtonClass}">
                        <ion-icon name="arrow-up-circle-outline" class="text-xl pointer-events-none"></ion-icon>
                        <span class="upvote-count font-medium pointer-events-none">${project.upvotes || 0}</span>
                    </button>
                    <button data-vote="down" class="${downvoteButtonClass}">
                       <ion-icon name="arrow-down-circle-outline" class="text-xl pointer-events-none"></ion-icon>
                       <span class="downvote-count font-medium pointer-events-none">${project.downvotes || 0}</span>
                    </button>
                </div>
                <div class="flex items-center space-x-1 cursor-pointer hover:text-indigo-600" title="View Feedback (Not Implemented)">
                    <ion-icon name="chatbubbles-outline" class="text-lg"></ion-icon>
                    <span>0</span> <!-- Placeholder for feedback count -->
                </div>
            </div>
            ${project.project_url ? `<a href="${project.project_url}" target="_blank" rel="noopener noreferrer" class="block text-center mt-4 bg-gray-100 text-gray-700 px-4 py-1.5 rounded-md hover:bg-gray-200 text-sm font-medium">View Project Link</a>` : ''}
        </div>
    `;
    return div;
}


// --- Project Submission (submit.html) ---
async function handleProjectSubmit(event) {
    event.preventDefault();
     if (!submitProjectForm || !currentUser || !userProfile) {
         displayMessage(submitError, "Authentication error or form issue.");
         return;
     }

    const titleInput = document.getElementById('project-title');
    const descriptionInput = document.getElementById('project-description');
    const linkInput = document.getElementById('project-link');
    const tagsInput = document.getElementById('project-tags');
    const imageInput = document.getElementById('project-image'); // Get image input

    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    const projectUrl = linkInput.value.trim();
    const tagsRaw = tagsInput.value.trim();
    const imageFile = imageInput.files[0]; // Get the selected file


    displayMessage(submitError, '');
    displayMessage(submitSuccess, '', true);

    if (!title || !description) {
         displayMessage(submitError, "Project Title and Description are required.");
         return;
     }

     // Image validation (optional: size, type)
     let imageUrl = null; // To store the public URL after upload
     const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
     if (imageFile) {
         if (imageFile.size > MAX_IMAGE_SIZE) {
             displayMessage(submitError, "Image file size exceeds 5MB limit.");
             return;
         }
         if (!['image/png', 'image/jpeg', 'image/gif'].includes(imageFile.type)) {
             displayMessage(submitError, "Invalid image file type. Use PNG, JPG, or GIF.");
             return;
         }
     }

    const tags = tagsRaw
        ? tagsRaw.split(',')
                 .map(tag => tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')) // Sanitize tags (alphanumeric, dash)
                 .filter((tag, index, self) => tag !== '' && self.indexOf(tag) === index)
                 .slice(0, 10)
        : [];

    submitProjectButton.disabled = true;
    submitProjectButton.textContent = 'Processing...';

    try {
         // 1. Upload Image if present
         if (imageFile) {
             submitProjectButton.textContent = 'Uploading image...';
             const fileExt = imageFile.name.split('.').pop();
             const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`; // Unique filename
             const filePath = `project-images/${fileName}`; // Folder in your bucket

             // Ensure you have a bucket named 'project-images' in Supabase Storage
             // and appropriate Storage Policies (e.g., allow authenticated users to upload to a path matching their user ID).
             const { data: uploadData, error: uploadError } = await supabase
                 .storage
                 .from('project-images') // **** YOUR BUCKET NAME HERE ****
                 .upload(filePath, imageFile);

             if (uploadError) {
                 console.error("Image upload error:", uploadError);
                 throw new Error(`Image upload failed: ${uploadError.message}`);
             }

             // 2. Get Public URL of the uploaded image
             const { data: urlData } = supabase
                 .storage
                 .from('project-images') // **** YOUR BUCKET NAME HERE ****
                 .getPublicUrl(filePath);

             if (!urlData || !urlData.publicUrl) {
                console.warn("Could not get public URL for uploaded image, path:", filePath);
                // Decide how to handle - proceed without image URL or throw error?
                // For now, proceed without it, but log warning.
             } else {
                imageUrl = urlData.publicUrl;
                console.log("Image uploaded:", imageUrl);
             }
         }

         // 3. Insert Project Data (including image URL if upload was successful)
         submitProjectButton.textContent = 'Saving project...';
        const { data: projectData, error: insertError } = await supabase
            .from('projects')
            .insert({
                user_id: currentUser.id,
                title: title,
                description: description,
                project_url: projectUrl || null,
                tags: tags.length > 0 ? tags : null,
                image_url: imageUrl // Add the public URL here
            })
            .select()
            .single();

        if (insertError) throw insertError;

        displayMessage(submitSuccess, "Project submitted successfully!", true, 5000);
        submitProjectForm.reset();
        // Redirect after success
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);

    } catch (error) {
        console.error("Project submission process error:", error);
        // More specific error messages
        let userErrorMessage = `Submission failed: ${error.message || 'Unknown error'}`;
        if (error.message && error.message.includes('Storage bucket not found')) {
            userErrorMessage = "Submission failed: Image storage bucket not configured correctly.";
        } else if (error.message && error.message.includes('mime type')) {
             userErrorMessage = "Submission failed: Invalid image file type detected during upload.";
        }
        displayMessage(submitError, userErrorMessage);
    } finally {
         submitProjectButton.disabled = false;
         submitProjectButton.textContent = 'Share Project';
    }
}

// --- Voting ---
async function handleVoteClick(event) {
    const button = event.target.closest('.vote-button');
    if (!button) return;

    if (!currentUser) {
        showElement(loginModal);
        return;
    }

    const voteType = button.dataset.vote === 'up' ? 1 : -1;
    const card = button.closest('[data-project-id]');
    const projectId = parseInt(card?.dataset.projectId, 10);

    if (isNaN(projectId)) {
        console.error("Invalid project ID on card.");
        return;
    }

    const buttonsOnCard = card.querySelectorAll('.vote-button');
    buttonsOnCard.forEach(b => b.disabled = true); // Disable during processing

    try {
        // Use Supabase edge function or RPC for atomic vote operation (more robust)
        // Or continue with client-side logic (less atomic but simpler for now):

        // 1. Check existing vote
        const { data: existingVote, error: fetchError } = await supabase
            .from('votes')
            .select('id, vote_type')
            .eq('user_id', currentUser.id)
            .eq('project_id', projectId)
            .maybeSingle();

        if (fetchError) throw fetchError;

        let operationPerformed = null;

        if (existingVote) {
            if (existingVote.vote_type === voteType) { // Unvoting
                const { error: deleteError } = await supabase.from('votes').delete().eq('id', existingVote.id);
                if (deleteError) throw deleteError;
                operationPerformed = 'removed';
            } else { // Changing vote
                const { error: updateError } = await supabase.from('votes').update({ vote_type: voteType, created_at: new Date().toISOString() }).eq('id', existingVote.id);
                if (updateError) throw updateError;
                operationPerformed = 'updated';
            }
        } else { // New vote
            const { error: insertError } = await supabase.from('votes').insert({ user_id: currentUser.id, project_id: projectId, vote_type: voteType });
            if (insertError) throw insertError;
            operationPerformed = 'inserted';
        }

         console.log(`Vote operation [${operationPerformed}] for project ${projectId} successful.`);

        // 2. Update counts visually
        await updateVoteCountsOnCard(card, projectId);

    } catch (error) {
        console.error("Voting error:", error);
        // Maybe display a temporary error message near the buttons
    } finally {
        buttonsOnCard.forEach(b => b.disabled = false); // Re-enable
    }
}

async function updateVoteCountsOnCard(cardElement, projectId) {
     if (!cardElement || isNaN(projectId)) return;

    try {
        // Use the specific DB function for counts
         const { data: voteData, error: rpcError } = await supabase.rpc('get_project_vote_counts', { pid: projectId });

         if (rpcError) throw rpcError;

         let upvotes = voteData?.upvotes || 0;
         let downvotes = voteData?.downvotes || 0;

        // Update the DOM elements
        const upvoteSpan = cardElement.querySelector('.upvote-count');
        const downvoteSpan = cardElement.querySelector('.downvote-count');
        if (upvoteSpan) upvoteSpan.textContent = upvotes;
        if (downvoteSpan) downvoteSpan.textContent = downvotes;

        // Optional: Highlight user's current vote
        // await highlightCurrentUserVoteOnCard(cardElement, projectId);

    } catch(error) {
        console.error(`Error updating vote counts for project ${projectId}:`, error);
    }
}

// Optional Enhancement: Highlight user's vote
async function highlightCurrentUserVoteOnCard(cardElement, projectId) {
    if (!currentUser || !cardElement || isNaN(projectId)) return;

    const upvoteButton = cardElement.querySelector('button[data-vote="up"]');
    const downvoteButton = cardElement.querySelector('button[data-vote="down"]');

    // Reset styles first
    upvoteButton?.classList.remove('text-green-600', 'font-semibold');
    downvoteButton?.classList.remove('text-red-600', 'font-semibold');
     upvoteButton?.classList.add('text-gray-500'); // Default color
     downvoteButton?.classList.add('text-gray-500'); // Default color


    try {
        const { data: userVote, error } = await supabase
            .from('votes')
            .select('vote_type')
            .eq('user_id', currentUser.id)
            .eq('project_id', projectId)
            .maybeSingle();

        if (error) {
            console.warn("Couldn't fetch user's vote for highlighting:", error.message);
            return;
        }

        if (userVote) {
            if (userVote.vote_type === 1 && upvoteButton) {
                upvoteButton.classList.remove('text-gray-500');
                upvoteButton.classList.add('text-green-600', 'font-semibold');
            } else if (userVote.vote_type === -1 && downvoteButton) {
                 downvoteButton.classList.remove('text-gray-500');
                downvoteButton.classList.add('text-red-600', 'font-semibold');
            }
        }
    } catch (error) {
        console.error("Error highlighting vote:", error);
    }
}

async function highlightUserVotes(projectIds) {
     if (!currentUser || !projectIds || projectIds.length === 0) return;

     try {
         const { data: userVotes, error } = await supabase
             .from('votes')
             .select('project_id, vote_type')
             .eq('user_id', currentUser.id)
             .in('project_id', projectIds);

         if (error) {
             console.warn("Could not fetch batch user votes for highlighting:", error.message);
             return;
         }

         if (userVotes && userVotes.length > 0) {
             userVotes.forEach(vote => {
                 const card = projectGrid.querySelector(`[data-project-id="${vote.project_id}"]`);
                 if (card) {
                     const upBtn = card.querySelector('button[data-vote="up"]');
                     const downBtn = card.querySelector('button[data-vote="down"]');
                     upBtn?.classList.remove('text-green-600', 'font-semibold');
                     downBtn?.classList.remove('text-red-600', 'font-semibold');
                     upBtn?.classList.add('text-gray-500');
                     downBtn?.classList.add('text-gray-500');


                     if (vote.vote_type === 1 && upBtn) {
                         upBtn.classList.remove('text-gray-500');
                         upBtn.classList.add('text-green-600', 'font-semibold');
                     } else if (vote.vote_type === -1 && downBtn) {
                          downBtn.classList.remove('text-gray-500');
                         downBtn.classList.add('text-red-600', 'font-semibold');
                     }
                 }
             });
         }
     } catch (error) {
         console.error("Error in batch highlighting votes:", error);
     }
 }


// --- Event Listeners ---
function setupEventListeners() {
    if (loginButton) loginButton.addEventListener('click', () => showElement(loginModal));
    if (signupButton) signupButton.addEventListener('click', () => showElement(signupModal));
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);

    if (closeLoginModalButton) closeLoginModalButton.addEventListener('click', () => hideElement(loginModal));
    if (closeSignupModalButton) closeSignupModalButton.addEventListener('click', () => hideElement(signupModal));
    if (closeLoginModalX) closeLoginModalX.addEventListener('click', () => hideElement(loginModal));
    if (closeSignupModalX) closeSignupModalX.addEventListener('click', () => hideElement(signupModal));

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignUp);
    if (submitProjectForm) submitProjectForm.addEventListener('submit', handleProjectSubmit);

    if (projectGrid) { // Only add vote listener if project grid exists
        projectGrid.addEventListener('click', handleVoteClick);
    }

     window.addEventListener('click', (event) => {
        if (event.target === loginModal) hideElement(loginModal);
        if (event.target === signupModal) hideElement(signupModal);
    });
     window.addEventListener('keydown', (event) => {
         if (event.key === 'Escape') {
             if (loginModal && !loginModal.classList.contains('hidden')) hideElement(loginModal);
             if (signupModal && !signupModal.classList.contains('hidden')) hideElement(signupModal);
         }
     });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up ProjectHub app.");
    setupEventListeners();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`Auth Event: ${event}`, session);
        const previousUserId = currentUser?.id;
        currentUser = session?.user ?? null;
        userProfile = null; // Reset profile on any auth change

        if (currentUser) {
            if (currentUser.id !== previousUserId) { // Only fetch profile if user actually changed
                 await fetchUserProfile(currentUser.id);
            } else {
                 updateUserUI(); // Update UI anyway (e.g., token refreshed)
            }
        } else {
            // User logged out or session invalid
            updateUserUI();
        }

        // Load or reload projects on index page after auth state is known
        if (projectGrid) {
            console.log("Auth state change detected on index page, reloading projects.");
            loadProjects(); // Will also call highlightUserVotes if implemented and user logged in
        }

        // Re-evaluate submit page state
        updateUserUI();
    });

    // Initial check - onAuthStateChange handles the initial state automatically
    console.log("App initialization complete. Waiting for auth state...");
});