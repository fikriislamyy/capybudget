# Free-tier VPS setup for CapyBudget

Checked against provider documentation on **2 October 2026**. Free-tier terms can change; confirm your console's eligibility and cost estimate before creating resources. After preparing the VPS, follow the [Jenkins deployment guide](deployment-jenkins.md).

## 1. Choose one VPS initially

My recommendation is **one Oracle Cloud Ampere A1 VPS**, Ubuntu 24.04 ARM64, starting at **2 OCPUs and 12 GB RAM** if your account and region have free capacity. Run Jenkins locally, outside the VPS. This sizing is a starting estimate for a small deployment, not a measured concurrency guarantee.

Oracle's current documentation lists 1,500 OCPU-hours and 9,000 GB-hours monthly for A1, equivalent to 2 OCPUs/12 GB total, plus 200 GB combined boot/block storage. These are tenancy-wide allowances, not per-server grants. Older tutorials claiming 4 OCPUs/24 GB do not match the current page. Always Free compute must be in the home region; capacity can be unavailable and idle instances may be reclaimed. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

| Choice | Fit for CapyBudget |
| --- | --- |
| One A1 VPS | Recommended initially: CPU/RAM available to API, database, workers and PDF generation together; one server to maintain |
| Two A1 VPSs | Same total free allowance split across two systems; extra boot storage/networking/maintenance; no automatic high availability |
| Oracle E2 micro | Too constrained for this complete stack and PDF/build workload |
| Google Cloud ongoing free VM | Eligible `e2-micro` in selected US regions, 30 GB standard disk, limited outbound traffic; not my choice for this full stack. [Google free tier](https://docs.cloud.google.com/free/docs/free-cloud-features) |
| AWS new-account free plan | Time/credit limited: up to six months or credit exhaustion, not an indefinite free VPS. [EC2 free tier](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html) |

If Oracle has no capacity, try another availability domain within your home region or wait. Do not select a paid shape assuming trial credits make it permanently free. If reliable availability is required immediately, plan a paid fallback rather than promising that a free VPS can always be obtained.

Both `capybudget.bebem.my.id` and `api.capybudget.bebem.my.id` point to this **same VPS IPv4 address**. Caddy chooses the correct container using the hostname and URL path.

## 2. Create and secure the cloud account

1. Sign up at [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/). Complete the identity/payment verification required for your account.
2. Choose the home region carefully, considering latency for Indonesian users and A1 availability. Do not assume a nearby region has free capacity.
3. Enable MFA on the cloud administrator account. Store recovery codes safely.
4. Create a compartment named `capybudget` to group project resources.
5. Check Billing/Cost Analysis, service limits and quotas. Set budget alerts and review the resources after the trial ends. Budget alerts notify; they are not a hard spending cap.
6. Use Always Free-eligible resources explicitly. Avoid paid load balancers, managed databases, extra volumes, marketplace licenses and unnecessary public IPs.

## 3. Create networking

Create a VCN with a public subnet and internet gateway using the console's networking wizard. Confirm the subnet's IPv4 route sends `0.0.0.0/0` to that internet gateway.

Attach a network security group to the VPS with the following **stateful inbound** rules:

| Port | Source | Purpose |
| --- | --- | --- |
| TCP 22 | Your home/public IP `/32` | Administrator and local Jenkins SSH |
| TCP 80 | `0.0.0.0/0` | HTTPS certificate validation and redirect |
| TCP 443 | `0.0.0.0/0` | Public app/API HTTPS |
| UDP 443 | `0.0.0.0/0`, optional | Caddy HTTP/3 |

Review subnet security lists too: an existing broad SSH rule can undermine the narrower NSG rule. Remove broad port-22 rules only after confirming your administrator IP is allowed. Allow outbound traffic needed for DNS, time sync, package/image downloads, HTTPS object storage and SMTP submission. Preserve required cloud networking/ICMP rules.

Do **not** open 3000, 5173, 5432, 6379, 8333, 8025, 1025 or Jenkins 8080 to the internet. If your home IP changes, update the port-22 source before deploying again.

## 4. Create the instance

1. Compute → Instances → Create instance; name it `capybudget-prod`.
2. Select the `capybudget` compartment and your home region.
3. Choose an eligible **Ubuntu 24.04 ARM64** image and **VM.Standard.A1.Flex** shape.
4. Allocate **2 OCPUs / 12 GB RAM**, accounting for any other A1 resources in the tenancy.
5. Choose a 100 GB boot volume if the console confirms it fits the free storage allowance. Leave room in the tenancy budget for other volumes; track Docker image/cache growth on this disk.
6. Select the public subnet, assign a public IPv4 address, attach the NSG, and upload your administrator SSH **public** key. Keep the private key on your computer.
7. Confirm the image, storage and shape eligibility/cost summary, then create the instance. Keep boot-volume encryption enabled and review the provider's encryption settings.
8. Record the public IPv4, instance ID, region, image and architecture. Check whether the IP will change if the instance is recreated; update DNS if it does.

An ARM instance requires ARM-compatible images/binaries. The deployment templates build on the VPS and use Debian-based application images for Chromium support. Do not upload your laptop's `node_modules` or force `platform: linux/amd64` on A1.

## 5. Prepare Ubuntu

On your computer, replace `VPS_IP` and the key path:

```sh
ssh -i ~/.ssh/your_admin_key ubuntu@VPS_IP
```

On the VPS:

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nano openssl util-linux
sudo timedatectl set-timezone UTC
```

Keep server clocks accurate for OTP, sessions and schedules. Users' display timezones remain app settings.

Install Docker Engine and the Compose plugin using Docker's **official Ubuntu apt-repository instructions**: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository). Select the repository installation method, add the signing key/repository, then install `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin` and `docker-compose-plugin`. Do not install the legacy `docker-compose` Python package. Verify:

```sh
sudo systemctl enable --now docker
sudo docker run --rm hello-world
docker compose version
uname -m
```

On A1, architecture should be `aarch64`. Check both the cloud firewall and Ubuntu's existing iptables/nftables/UFW configuration; OCI images may have their own rules. Preserve SSH and cloud metadata access. Permit 80/443 using the active firewall manager, then test from your computer. Docker-published ports can bypass UFW rules, so rely on the cloud perimeter plus publishing only intended ports. See [Docker firewall limitations](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations).

## 6. Create the deployment account

On the VPS as `ubuntu`:

```sh
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
sudo install -d -m 750 -o deploy -g deploy /opt/capybudget
sudo install -d -m 750 -o deploy -g deploy /opt/capybudget/releases
sudo install -d -m 700 -o deploy -g deploy /opt/capybudget/secrets
sudo -u deploy nano /home/deploy/.ssh/authorized_keys
```

Paste your administrator public key and the dedicated Jenkins public key as separate lines. See the [Jenkins guide](deployment-jenkins.md#ssh-credentials) for generating the latter. Then:

```sh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Open a **second** SSH session as `deploy` and confirm `docker ps` works before changing any SSH authentication settings. Keep the original administrator session open until this works. Docker-group membership is root-equivalent; this account must only be accessible with trusted keys.

Use key-only login and disable direct root SSH after verifying access. Apply OS security updates routinely and schedule reboots when needed. Swap can be an emergency buffer for builds, but should not be used to justify running the app on an undersized VM; protect swap with the same disk-encryption policy as the data.

## 7. Add DNS records

At the authoritative DNS provider for `bebem.my.id`, create:

| Type | Name within the `bebem.my.id` zone | Value |
| --- | --- | --- |
| A | `capybudget` | VPS public IPv4 |
| A | `api.capybudget` | Same VPS public IPv4 |

Use a short TTL such as 300 seconds during setup. If the provider asks for full names, enter `capybudget.bebem.my.id` and `api.capybudget.bebem.my.id`. Do not append the zone twice. Start with **DNS only** in Cloudflare. Remove stale AAAA records unless IPv6 is configured end to end.

Check resolution from your computer:

```sh
nslookup capybudget.bebem.my.id
nslookup api.capybudget.bebem.my.id
```

Caddy will obtain certificates when the application is deployed. A connection failure before Caddy starts is expected; a DNS answer pointing to the wrong IP is not.

## 8. Configure storage and outbound email

Follow [production secrets and services](deployment-jenkins.md#4-configure-production-secrets-on-the-vps): SeaweedFS stores live files privately on this VPS; an off-host S3 bucket stores encrypted backups and deletion tombstones. Retain encryption keys separately. A VPS snapshot alone does not replace the app's database/file-consistent recovery procedure.

For email, choose a provider with SMTP submission and a suitable free allowance. Oracle currently lists 3,000 Email Delivery messages monthly among its Always Free resources; outbound port 25 is blocked by default. Use a supported submission endpoint/port and confirm limits in your tenancy. [Oracle email/network allowances](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

If choosing Oracle Email Delivery:

1. Open Email Delivery in the selected region and create an approved sender matching `EMAIL_FROM`.
2. Configure the sending domain's SPF/DKIM records and DMARC.
3. Generate SMTP credentials for a dedicated IAM user with the required email-delivery policy; these are not your console password.
4. Copy the region's SMTP endpoint and submission settings shown in the console into `production.env`.
5. Check account restrictions/approval and send a real OTP through the deployed app. Monitor delivery failures and monthly volume.

Use [Oracle's SMTP configuration instructions](https://docs.oracle.com/en-us/iaas/Content/Email/Tasks/configuresmtpconnection.htm) for the exact regional endpoint, IAM and TLS details. Do not guess the endpoint or open inbound SMTP ports on the VPS. Mailpit stays on your development computer.

## 9. Deploy and prove recovery

Continue with [local Jenkins setup and first deployment](deployment-jenkins.md#6-start-jenkins-locally-named-jenkins). Before inviting users:

1. Complete the real user-flow checks in that guide, including first signup email, receipts, PDFs, forecast worker and privacy export/deletion.
2. Verify off-host backup upload and a successful isolated restore with the complete encryption keyring.
3. Review the documented bootstrap database-role and S3 bucket-creation permissions; complete least-privilege hardening for a public multi-user deployment.
4. Configure independent uptime checks for both domains and alerts for backup/job failures. Jenkins cannot notify you when your computer is off unless you add an independent monitoring service.
5. Record how to recreate the VPS from the repository, restore data, update DNS, and reconnect Jenkins. Store this runbook and secrets securely outside the VPS.

## 10. Keep the setup within the free allowance

| Item | What to monitor |
| --- | --- |
| Compute | Aggregate A1 CPU/RAM hours; other instances consume the same allowance |
| Disk | Boot/block volume allocation, retained snapshots, Docker images, logs, database and receipt growth |
| Object storage | Live/backup retention and operation counts; optional R2 overages are billable |
| Email | Provider's monthly allowance and delivery limits |
| Networking | Public IP, egress and any extra network service charges in the selected provider |
| Availability | Capacity shortages and idle-instance reclamation; keep off-host recovery ready |
| Domain | Existing domain renewal is separate from free hosting |

Review costs after creation, after the trial ends, and monthly. Do not generate artificial load to evade idle-resource policies. If the app becomes important to paying users, budget for reliable paid hosting and tested recovery even if this free deployment is working well.
