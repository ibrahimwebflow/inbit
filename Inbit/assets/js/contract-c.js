import { supabase } from "../../supabase/config.js";
import { markPaymentSent } from "./client.js"; // reuse the function we wrote earlier

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const contractId = params.get("contract");
  if (!contractId) {
    alert("No contract selected.");
    return;
  }

  loadContract(contractId);

  const form = document.getElementById("markPaymentForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const proofFile = document.getElementById("proofFile").files[0];
    try {
      await markPaymentSent(contractId, proofFile);
      alert("Payment marked as sent. Freelancer and admin have been notified.");
      window.location.reload();
    } catch (err) {
      alert("Error: " + err.message);
    }
  });
});

async function loadContract(contractId) {
  // Fetch contract info
  const { data: contract, error } = await supabase
    .from("contracts")
    .select("*, hires(jobs(title, description), users!hires_freelancer_id_fkey(full_name))")
    .eq("id", contractId)
    .single();

  if (error) {
    console.error(error);
    document.getElementById("contractInfo").innerHTML = "<p>Error loading contract</p>";
    return;
  }

  // Display contract info
  document.getElementById("contractInfo").innerHTML = `
    <p><b>Job:</b> ${contract.hires.jobs.title}</p>
    <p><b>Description:</b> ${contract.hires.jobs.description}</p>
    <p><b>Freelancer:</b> ${contract.hires.users.full_name}</p>
    <p><b>Total Amount:</b> ${contract.total_amount} ${contract.currency}</p>
    <p><b>Payment Method:</b> ${contract.payment_method}</p>
    <p><b>Status:</b> ${contract.status}</p>
    ${contract.proof_url ? `<p><b>Your Proof:</b> <a href="${contract.proof_url}" target="_blank">View</a></p>` : ""}
  `;

  // Fetch freelancer payment details
  const { data: details, error: detailsErr } = await supabase
    .from("contract_payment_details")
    .select("*")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (detailsErr || !details) {
    document.getElementById("freelancerDetails").innerHTML = "<p>Freelancer has not provided payment details yet.</p>";
    document.getElementById("markPaymentForm").style.display = "none"; // hide until freelancer provides details
    return;
  }

  // Display freelancer details
  let detailsHtml = "";
  if (details.payment_method === "bank_transfer") {
    detailsHtml = `
      <p><b>Bank Name:</b> ${details.details.bank_name}</p>
      <p><b>Account Name:</b> ${details.details.account_name}</p>
      <p><b>Account Number:</b> ${details.details.account_number}</p>
      <p><b>SWIFT:</b> ${details.details.swift}</p>
    `;
  } else if (details.payment_method === "crypto") {
    detailsHtml = `
      <p><b>Network:</b> ${details.details.crypto_network}</p>
      <p><b>Wallet Address:</b> ${details.details.address}</p>
    `;
  } else {
    detailsHtml = `<pre>${JSON.stringify(details.details, null, 2)}</pre>`;
  }

  if (details.proof_url) {
    detailsHtml += `<p><b>Proof:</b> <a href="${details.proof_url}" target="_blank">View</a></p>`;
  }

  document.getElementById("freelancerDetails").innerHTML = detailsHtml;
}
