import { supabase } from "../../supabase/config.js";

const availabilityBtn = document.getElementById("toggleAvailability");
const statusText = document.getElementById("availabilityStatus");
const portfolioForm = document.getElementById("portfolioForm");
const portfolioList = document.getElementById("portfolioList");
const matchedJobsDiv = document.getElementById("matchedJobs");

// Get logged-in freelancer
async function getFreelancer() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    alert("Not logged in.");
    window.location.href = "login.html";
    return null;
  }
  return user;
}

// Load availability
async function loadAvailability() {
  const freelancer = await getFreelancer();
  if (!freelancer) return;

  const { data, error } = await supabase
    .from("users")
    .select("available")
    .eq("id", freelancer.id)
    .single();

  if (error) return;

  statusText.textContent = data.available ? "✅ Available" : "❌ Not Available";
  availabilityBtn.textContent = data.available ? "Set Unavailable" : "Set Available";
}

// Toggle availability
// Toggle availability (freelancer side)
async function toggleAvailability() {
  const freelancer = await getFreelancer(); // your existing helper
  if (!freelancer) return;

  // fetch current available state
  const { data, error } = await supabase
    .from("users")
    .select("available")
    .eq("id", freelancer.id)
    .single();
  if (error) { console.error(error); return; }

  const newStatus = !data.available;

  // If turning ON, check unpaid fees
  if (newStatus === true) {
    const { data: unpaid, error: feeErr } = await supabase
      .from("platform_fees")
      .select("id, contract_id, fee_amount, status")
      .eq("freelancer_id", freelancer.id)
      .neq("status", "paid"); // any status that's not paid (unpaid/pending_verification/rejected)
    if (feeErr) { console.error(feeErr); }
    if (unpaid && unpaid.length > 0) {
      // Option: show details and send them to the fees page
      const totalDue = unpaid.reduce((s, f) => s + Number(f.fee_amount || 0), 0).toFixed(2);
      alert(`You have outstanding platform fees totaling ${totalDue}. Pay them to become available again.`);
      // redirect to freelancer fees page
      window.location.href = "/freelancer/fees.html";
      return;
    }
  }

  // No unpaid fees or toggling off → proceed
  const { error: updErr } = await supabase
    .from("users")
    .update({ available: newStatus })
    .eq("id", freelancer.id);

  if (updErr) {
    console.error("Failed to update availability:", updErr);
    alert("Failed to change availability.");
    return;
  }
  loadAvailability();
}



// Placeholder for matched jobs (later will plug AI matching)
/**
 * MATCHED JOBS
 */
async function loadMatchedJobs() {
  const freelancer = await getFreelancer();
  if (!freelancer) return;

  const container = document.getElementById("matchedJobs");
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading matched jobs...</div>';

const { data, error } = await supabase
  .from("job_matches")
  .select(`
    id,
    score,
    jobs(
      id, title, description, created_at, client_id,
      hires(
        contracts(id, status)
      )
    ),
    clients:jobs!inner(client_id, users(full_name))
  `)
  .eq("freelancer_id", freelancer.id)
  .order("score", { ascending: false });


  if (error) {
    container.innerHTML = '<p class="error">Error loading matched jobs.</p>';
    console.error(error);
    return;
  }

  // Filter: remove jobs that already have a completed contract
// skip jobs with completed contracts
const filtered = (data || []).filter(m => {
  const hires = m.jobs.hires || [];
  return !hires.some(h => h.contracts?.some(c => c.status === "completed"));
});


  container.innerHTML = '<div class="jobs-grid"></div>';
  const jobsGrid = container.querySelector(".jobs-grid");

  if (filtered.length === 0) {
    jobsGrid.innerHTML = `
      <div class="empty-jobs">
        <h3>No Active Job Matches</h3>
        <p>All your matched jobs are either completed or awaiting new openings.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((match, index) => {
    const job = match.jobs;
    const jobCard = document.createElement("div");
    jobCard.className = "job-card";
    jobCard.style.animationDelay = `${index * 0.1}s`;

    jobCard.innerHTML = `
      <div class="job-header">
        <h3 class="job-title">${job.title}</h3>
        <span class="match-badge">${Math.round(match.score)}% Match</span>
      </div>
      
      <div class="job-description">
        ${job.description}
      </div>
      
      <div class="job-meta">
        <div class="meta-item">
          <span class="meta-label">Posted</span>
          <span class="meta-value">${new Date(job.created_at).toLocaleDateString()}</span>
        </div>
        ${match.clients?.users ? `
          <div class="meta-item">
            <span class="meta-label">Client</span>
            <span class="meta-value">${match.clients.users.full_name}</span>
          </div>
        ` : ""}
      </div>
      
      <div class="job-status">
        <span class="status-icon">✅</span>
        <div>
          <div class="status-text">You've Been Matched!</div>
          <div class="status-note">Awaiting client hire decision</div>
        </div>
      </div>
    `;

    jobsGrid.appendChild(jobCard);
  });
}



// Init
document.addEventListener("DOMContentLoaded", () => {
  loadAvailability();
  loadMatchedJobs();

  if (availabilityBtn) availabilityBtn.addEventListener("click", toggleAvailability);
  if (portfolioForm) portfolioForm.addEventListener("submit", handlePortfolioUpload);
});


async function loadHires() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const hiresList = document.getElementById("hiresList");

  if (error || !user) {
    hiresList.innerHTML = "<p>You must be logged in.</p>";
    return;
  }

  // ✅ Fetch hires with contracts joined
  const { data, error: hiresError } = await supabase
    .from("hires")
    .select(`
      id,
      created_at,
      jobs (id, title, description, deadline),
      users!hires_client_id_fkey (full_name),
      contracts (id, status, created_at)
    `)
    .eq("freelancer_id", user.id)
    .order("created_at", { ascending: false });

  if (hiresError) {
    hiresList.innerHTML = "<p>Error loading hires.</p>";
    console.error(hiresError);
    return;
  }

  if (!data || data.length === 0) {
    hiresList.innerHTML = "<p>No jobs yet.</p>";
    return;
  }

  // ✅ Filter out hires where ALL contracts are completed
  const activeHires = data.filter((hire) => {
    if (!hire.contracts || hire.contracts.length === 0) {
      return true; // no contracts yet → include
    }
    // include if at least one contract is not completed
    return hire.contracts.some((c) => c.status !== "completed");
  });

  if (activeHires.length === 0) {
    hiresList.innerHTML = "<p>No active jobs.</p>";
    return;
  }

  hiresList.innerHTML = "";
  
  // Helper functions - define them inside loadHires but outside the loop
  const getDeadlineSectionClass = (daysDiff) => {
    if (daysDiff > 5) return 'green';
    if (daysDiff > 0 && daysDiff <= 5) return 'yellow';
    if (daysDiff === 0) return 'orange';
    return 'red';
  };

  const getProgressBarClass = (daysDiff) => {
    if (daysDiff > 5) return 'progress-green';
    if (daysDiff > 0 && daysDiff <= 5) return 'progress-yellow';
    if (daysDiff === 0) return 'progress-orange';
    return 'progress-red';
  };

  const getDaysText = (daysDiff) => {
    if (daysDiff > 5) return `${daysDiff} days remaining`;
    if (daysDiff > 0 && daysDiff <= 5) return `${daysDiff} days left`;
    if (daysDiff === 0) return 'Due today';
    return `${Math.abs(daysDiff)} days overdue`;
  };

  const calculateProgressWidth = (daysDiff, deadlineDate) => {
    if (!deadlineDate || daysDiff < 0) return 100;
    
    const totalDuration = 14; // Assume 14-day project for progress calculation
    const daysPassed = totalDuration - daysDiff;
    const progress = (daysPassed / totalDuration) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  const getDeadlineHighlight = (daysDiff) => {
    if (daysDiff > 5) {
      return `<span class="badge badge-green">🟢 ${daysDiff} days remaining</span>`;
    } else if (daysDiff > 0 && daysDiff <= 5) {
      return `<span class="badge badge-yellow">🟡 ${daysDiff} days left — getting close!</span>`;
    } else if (daysDiff === 0) {
      return `<span class="badge badge-orange">🟠 Deadline is today!</span>`;
    } else {
      return `<span class="badge badge-red">🔴 Overdue by ${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? "s" : ""}</span>`;
    }
  };

  activeHires.forEach((hire) => {
    const latestContract = hire.contracts?.[0];
    const status = latestContract ? latestContract.status : "No contract yet";

    const deadlineDate = hire.jobs.deadline ? new Date(hire.jobs.deadline) : null;
    const now = new Date();

    let deadlineText = "No deadline set";
    let daysDiff = null;

    if (deadlineDate) {
      daysDiff = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      deadlineText = deadlineDate.toLocaleDateString();
    }

    // Generate the deadline highlight HTML
    const deadlineHighlight = daysDiff !== null ? getDeadlineHighlight(daysDiff) : '';

    hiresList.innerHTML += `
      <div class="card">
        <h3>${hire.jobs.title}</h3>
        <p>${hire.jobs.description}</p>
        
        ${deadlineDate ? `
          <div class="deadline-section ${getDeadlineSectionClass(daysDiff)}">
            <div class="deadline-info">
              <span class="deadline-date">📅 ${deadlineText}</span>
              <span class="deadline-days">${getDaysText(daysDiff)}</span>
            </div>
            ${deadlineHighlight}
            <div class="deadline-progress">
              <div class="progress-bar ${getProgressBarClass(daysDiff)}" style="width: ${calculateProgressWidth(daysDiff, deadlineDate)}%"></div>
            </div>
          </div>
        ` : `
          <div class="deadline-section">
            <div class="deadline-info">
              <span class="deadline-date">📅 ${deadlineText}</span>
            </div>
            <span class="badge">No deadline set</span>
          </div>
        `}
        
        <p><b>Client:</b> ${hire.users.full_name}</p>
        <p><b>Status:</b> ${status}</p>
        <small>Hired on ${new Date(hire.created_at).toLocaleString()}</small>
        <button onclick="window.location.href='../chat/chat.html?hire=${hire.id}'">
          Chat
        </button>
      </div>
    `;
  });
}

document.addEventListener("DOMContentLoaded", loadHires);



async function loadNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = document.getElementById("notificationsList");
  if (error || !data || data.length === 0) {
    list.innerHTML = "<li>No notifications</li>";
    return;
  }

  list.innerHTML = "";
  data.forEach(n => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${n.message}
      <button class="dismiss-btn" data-id="${n.id}">Dismiss</button>
    `;
    list.appendChild(li);
  });

  // Attach event listeners to dismiss buttons
  document.querySelectorAll(".dismiss-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await deleteNotification(id);
      e.target.parentElement.remove();
    });
  });
}


// Real-time subscription
function subscribeToNotifications(userId) {
  supabase
    .channel("notifications-" + userId)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      payload => {
        const list = document.getElementById("notificationsList");
        const n = payload.new;

        const li = document.createElement("li");
        li.innerHTML = `
          ${n.message}
          <button class="dismiss-btn" data-id="${n.id}">Dismiss</button>
        `;

        li.querySelector(".dismiss-btn").addEventListener("click", async (e) => {
          await deleteNotification(n.id);
          e.target.parentElement.remove();
        });

        list.prepend(li);
      }
    )
    .subscribe();
}


async function deleteNotification(id) {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete notification:", error.message);
  }
}


// Init
document.addEventListener("DOMContentLoaded", async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    loadNotifications();
    subscribeToNotifications(user.id);
  }
});


// FREELANCER: mark received
export async function markReceived(contractId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const { error } = await supabase.from('contracts').update({
    freelancer_marked_received: true,
    status: 'payment_sent'  // still payment_sent until admin confirms release
  }).eq('id', contractId);

  if (error) throw error;

  // notify admin
  // (Assuming admin user(s) have role='admin' in users)
  const { data: admins } = await supabase.from('users').select('id').eq('role','admin');
  for (const a of admins || []) {
    await supabase.from('notifications').insert({
      user_id: a.id,
      type: 'payment',
      message: `Freelancer marked payment received for contract ${contractId}`
    });
  }
  return true;
}

async function loadContractForFreelancer() {
  const params = new URLSearchParams(window.location.search);
  const contractId = params.get('contract');
  if (!contractId) return;

  // get contract and show client-chosen payment_method
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id, payment_method, client_id, total_amount, freelancer_id')
    .eq('id', contractId)
    .single();
  if (error) {
    console.error(error);
    return;
  }

  document.getElementById('contractPaymentMethod').value = contract.payment_method;

  // show appropriate fields
  if (contract.payment_method === 'bank_transfer') {
    document.getElementById('bankFields').style.display = 'block';
  } else if (contract.payment_method === 'crypto') {
    document.getElementById('cryptoFields').style.display = 'block';
  }

  // attach submit listener
  const form = document.getElementById('paymentDetailsForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitPaymentDetails(contractId);
  });
}

async function submitPaymentDetails(contractId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('Login required');
    return;
  }

  // fetch contract to confirm freelancer is owner
  const { data: c, error: cErr } = await supabase.from('contracts').select('freelancer_id, payment_method').eq('id', contractId).single();
  if (cErr) { console.error(cErr); alert('Contract load error'); return; }
  if (c.freelancer_id !== user.id) { alert('Not authorized for this contract'); return; }

  const paymentMethod = c.payment_method;
  let details = {};

  if (paymentMethod === 'bank_transfer') {
    details.bank_name = document.querySelector('input[name="bank_name"]').value.trim();
    details.account_name = document.querySelector('input[name="account_name"]').value.trim();
    details.account_number = document.querySelector('input[name="account_number"]').value.trim();
    details.swift = document.querySelector('input[name="swift"]').value.trim();
  } else if (paymentMethod === 'crypto') {
    details.crypto_network = document.querySelector('input[name="crypto_network"]').value.trim();
    details.address = document.querySelector('input[name="address"]').value.trim();
  } else {
    // other method — collect freeform data
    details.note = 'See contact for details';
  }

  // optional proof upload
  const proofFile = document.getElementById('paymentProofFile').files[0];
  let proofUrl = null;
  if (proofFile) {
    const path = `contract-proofs/${contractId}/${Date.now()}-${proofFile.name}`;
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, proofFile);
    if (upErr) { console.error(upErr); alert('Upload failed'); return; }
    const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path);
    proofUrl = urlData.publicUrl;
  }

  const { data, error } = await supabase.from('contract_payment_details').insert([{
    contract_id: contractId,
    freelancer_id: user.id,
    payment_method: paymentMethod,
    details: details,
    proof_url: proofUrl
  }]).select('id').single();

  if (error) {
    console.error(error);
    alert('Failed to save details');
    return;
  }

  // notify client & admin
  // fetch client id from contracts
  const { data: contract } = await supabase.from('contracts').select('client_id').eq('id', contractId).single();
  if (contract?.client_id) {
    await supabase.from('notifications').insert({
      user_id: contract.client_id,
      type: 'info',
      message: `Freelancer has provided payment receiving details for contract ${contractId}.`
    });
  }
  // notify admin(s)
  const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
  for (const a of admins || []) {
    await supabase.from('notifications').insert({
      user_id: a.id,
      type: 'info',
      message: `Freelancer provided payment details for contract ${contractId}. Please verify.`
    });
  }

  alert('Payment details submitted. Please wait while client reviews or admin verifies.');
  // optional: redirect freelancer to contract view
  window.location.reload();
}

document.addEventListener('DOMContentLoaded', loadContractForFreelancer);


async function loadFreelancerSummary() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // 1. Fetch user profile
const { data: profile } = await supabase
  .from("users")
  .select("full_name, tone, language, verified, created_at, main_badges(name)")
  .eq("id", user.id)
  .single();


  // 2. Fetch completed contracts total + count
  const { data: contracts } = await supabase
    .from("contracts")
    .select("total_amount, status")
    .eq("freelancer_id", user.id)
    .eq("status", "completed");

  const totalEarnings = contracts?.reduce((sum, c) => sum + c.total_amount, 0) || 0;
  const completedCount = contracts?.length || 0;

  // 3. Render
  document.getElementById("userName").textContent = profile.full_name;
  const userNameEl = document.getElementById("userName");
userNameEl.textContent = profile.full_name;

if (profile.main_badges) {
  const badgeSpan = document.createElement("span");
  badgeSpan.className = "main-badge";
  badgeSpan.textContent = profile.main_badges.name; // the badge name
  userNameEl.appendChild(badgeSpan);
}

  document.getElementById("totalEarnings").textContent = totalEarnings.toLocaleString();
  document.getElementById("completedProjects").textContent = completedCount;
  document.getElementById("memberSince").textContent = new Date(profile.created_at).toLocaleDateString();
  document.getElementById("verifiedStatus").textContent = profile.verified ? "✅ Verified" : "❌ Not Verified";
}


document.addEventListener("DOMContentLoaded", () => {
  loadFreelancerSummary();
});


// Theme Toggle Functionality
function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle.querySelector('.theme-icon');
  const themeLabel = themeToggle.querySelector('.theme-label');
  
  // Check for saved theme or prefer-color-scheme
  const savedTheme = localStorage.getItem('theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  
  if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIcon.textContent = '🌙';
    themeLabel.textContent = 'Dark Mode';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeIcon.textContent = '☀️';
    themeLabel.textContent = 'Light Mode';
  }
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    
    if (currentTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeIcon.textContent = '☀️';
      themeLabel.textContent = 'Light Mode';
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Dark Mode';
      localStorage.setItem('theme', 'light');
    }
  });
}

// Initialize theme toggle when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
});
