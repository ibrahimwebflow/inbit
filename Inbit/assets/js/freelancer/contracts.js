import { supabase } from "../../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadContracts);

async function loadContracts() {
  const { data: { user } } = await supabase.auth.getUser();
  const container = document.getElementById("contractsList");
  
  if (!user) {
    container.innerHTML = "<p class='error'>You must be logged in as a freelancer.</p>";
    return;
  }

  // Show loading state
  container.innerHTML = "<div class='loading'>Loading your contracts...</div>";

  const { data, error } = await supabase
    .from("contracts")
    .select(`
      id,
      total_amount,
      payment_method,
      status,
      created_at,
      proof_url,
      hires(
        jobs(title),
        client:users!hires_client_id_fkey(full_name)
      )
    `)
    .eq("freelancer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    container.innerHTML = "<p class='error'>Error loading contracts. Please try again.</p>";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-contracts">
        <h3>No Contracts Yet</h3>
        <p>You haven't been hired for any contracts yet.</p>
        <p>Complete your profile and portfolio to get more opportunities!</p>
      </div>
    `;
    return;
  }

  // Update summary counters
  updateSummaryCounters(data);

  // Render contracts
  container.innerHTML = '<div class="contracts-grid"></div>';
  const contractsGrid = container.querySelector('.contracts-grid');

  data.forEach((contract, index) => {
    const contractCard = document.createElement("div");
    contractCard.className = "contract-card";
    contractCard.setAttribute("data-status", getStatusType(contract.status));
    contractCard.style.animationDelay = `${index * 0.1}s`;
    
    const statusClass = `status-${getStatusClass(contract.status)}`;
    const canMarkReceived = contract.status === "client_marked_sent" && contract.proof_url;
    
    contractCard.innerHTML = `
      <div class="contract-header">
        <h3 class="contract-title">${contract.hires.jobs.title}</h3>
        <span class="contract-badge ${statusClass}">${formatStatus(contract.status)}</span>
      </div>
      
      <div class="contract-details">
        <div class="detail-item">
          <span class="detail-label">Client</span>
          <span class="detail-value">${contract.hires.client?.full_name || 'Unknown'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Amount</span>
          <span class="detail-value amount-value">$${Number(contract.total_amount).toLocaleString()}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Payment Method</span>
          <span class="detail-value payment-method" data-method="${contract.payment_method}">
            ${formatPaymentMethod(contract.payment_method)}
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Contract ID</span>
          <span class="detail-value contract-id">#${contract.id}</span>
        </div>
      </div>
      
      ${contract.proof_url ? `
        <div class="proof-section">
          <h4>Client Payment Proof</h4>
          <a href="${contract.proof_url}" target="_blank" class="proof-link">
            View Payment Proof
          </a>
        </div>
      ` : ''}
      
      <div class="contract-actions">
        ${canMarkReceived ? `
          <button class="btn-mark-received" data-id="${contract.id}">
            Mark Payment Received
          </button>
        ` : contract.status === "freelancer_received" ? `
          <button class="btn-disabled" disabled>
            ✅ Payment Confirmed
          </button>
        ` : ''}
      </div>
      
      <div class="contract-meta">
        <span class="contract-date">Created: ${new Date(contract.created_at).toLocaleDateString()}</span>
        <span class="contract-id">#${contract.id}</span>
      </div>
    `;

    contractsGrid.appendChild(contractCard);
  });

  // Add event listeners for mark received buttons
  document.querySelectorAll(".btn-mark-received").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const contractId = e.target.dataset.id;
      await markPaymentReceived(contractId);
    });
  });
}

function updateSummaryCounters(contracts) {
  const total = contracts.length;
  const active = contracts.filter(c => 
    ['pending', 'client_marked_sent'].includes(c.status)
  ).length;
  const completed = contracts.filter(c => 
    ['completed', 'freelancer_received'].includes(c.status)
  ).length;

  document.getElementById('totalContracts').textContent = total;
  document.getElementById('activeContracts').textContent = active;
  document.getElementById('completedContracts').textContent = completed;
}

function getStatusType(status) {
  const statusMap = {
    'active': 'active',
    'completed': 'completed',
    'client_marked_sent': 'pending', // Change from 'pending_payment' to 'pending'
    'freelancer_received': 'completed'
  };
  return statusMap[status] || 'active';
}

function getStatusClass(status) {
  const classMap = {
    'active': 'active',
    'completed': 'completed',
    'client_marked_sent': 'sent',
    'freelancer_received': 'received'
  };
  return classMap[status] || 'active';
}

function formatStatus(status) {
  const statusMap = {
    'active': 'Active',
    'completed': 'Completed',
    'client_marked_sent': 'Payment Sent',
    'freelancer_received': 'Payment Received'
  };
  return statusMap[status] || status;
}

function formatPaymentMethod(method) {
  const methodMap = {
    'bank_transfer': 'Bank Transfer',
    'crypto': 'Cryptocurrency',
    'paypal': 'PayPal',
    'other': 'Other'
  };
  return methodMap[method] || method;
}

async function markPaymentReceived(contractId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Please login to confirm payment.");
    return;
  }

  // Show loading state on button
  const button = document.querySelector(`.btn-mark-received[data-id="${contractId}"]`);
  const originalText = button.innerHTML;
  button.innerHTML = 'Confirming...';
  button.disabled = true;

  const { error } = await supabase
    .from("contracts")
    .update({ status: "freelancer_received" })
    .eq("id", contractId);

  if (error) {
    console.error(error);
    alert("Failed to update contract. Please try again.");
    button.innerHTML = originalText;
    button.disabled = false;
    return;
  }

  // Notify client
  const { data: contract } = await supabase
    .from("contracts")
    .select("client_id")
    .eq("id", contractId)
    .single();

  if (contract?.client_id) {
    await supabase.from("notifications").insert({
      user_id: contract.client_id,
      type: "info",
      message: `Freelancer confirmed receiving payment for contract ${contractId}.`,
    });
  }

  // Show success and reload
  button.innerHTML = '✅ Confirmed!';
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}


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