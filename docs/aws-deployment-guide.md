# AWS Deployment Guide (Kubernetes + CI/CD)

This document describes how to take the WhatsApp Chatbot SaaS stack to production on AWS using Amazon RDS for Postgres, Amazon EKS for Kubernetes, and GitHub Actions for automated deployments. Follow the steps sequentially; each phase lists prerequisites and outputs that feed the next phase.

---

## 1. Prerequisites

1. **AWS account** with administrator access (or permissions covering IAM, VPC, RDS, ECR, EKS, ACM, Route53).
2. **Domain** (optional but recommended) managed in Route53 for HTTPS endpoints.
3. **CLI tooling** installed locally if you plan to run commands:
   - `aws` CLI v2 (`aws configure` with access key/secret).
   - `kubectl`.
   - `eksctl` (for simple EKS bootstrap) or Terraform/CloudFormation if you prefer IaC.
   - `docker` (for local image builds).
4. **GitHub repository access** with ability to set repository secrets for CI.

---

## 2. Database: Amazon RDS for PostgreSQL

1. Navigate to **RDS → Databases → Create database**.
2. Choose *Standard Create* → **PostgreSQL** engine.
3. Select **db.t3.micro** (or starter instance size) under *Free tier/Dev/Test*.
4. Set DB instance identifier (e.g., `chatbot-postgres`), master username/password.
5. Choose the VPC where EKS will run. If you have multiple subnets, pick at least two for Multi-AZ.
6. Connectivity options:
   - **Public access**: `No` (preferred) so only VPC resources (EKS nodes) can connect.
   - **VPC security group**: create or select one that will also be attached to the EKS worker nodes; allow inbound port 5432 from node security group.
7. Additional configuration:
   - Initial DB name: `chatbot`.
   - Enable storage autoscaling, backups, and monitoring as needed.
8. Launch the instance and note:
   - Endpoint (host).
   - Port (default 5432).
   - Database name, username, password.
9. Store the credentials securely (AWS Secrets Manager/SSM Parameter Store). Example secret structure:
   ```json
   {
     "host": "<rds-endpoint>",
     "port": 5432,
     "database": "chatbot",
     "username": "chatbot_admin",
     "password": "********"
   }
   ```

---

## 3. Container image

1. **Dockerfile** (at repo root) should:
   - Install dependencies (`npm ci`).
   - Build admin & owner apps (`npm run admin:build`, `npm run owner:build`) and copy their `dist` output into `public/` (or a serving path).
   - Copy server code and start with `node src/server.js`.
2. Build locally to verify:
   ```bash
   docker build -t chatbot-app:latest .
   docker run --env-file .env.local -p 3000:3000 chatbot-app:latest
   ```
3. Create an **ECR repository** (e.g., `chatbot-app`). Push instructions:
   ```bash
   aws ecr create-repository --repository-name chatbot-app
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   docker tag chatbot-app:latest <account>.dkr.ecr.<region>.amazonaws.com/chatbot-app:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/chatbot-app:latest
   ```

---

## 4. Kubernetes cluster (Amazon EKS)

### 4.1 Create cluster
1. With `eksctl`:
   ```bash
   eksctl create cluster \
     --name chatbot-cluster \
     --region <region> \
     --nodegroup-name chatbot-ng \
     --nodes 2 --nodes-min 2 --nodes-max 4 \
     --node-type t3.medium
   ```
   This provisions control plane, worker nodes, and configures kubectl (`~/.kube/config`).

2. Alternatively, use Terraform/CloudFormation if preferred; ensure you capture VPC/subnet/security-group IDs for future reference.

### 4.2 Install ingress & autoscaling
1. Deploy the AWS Load Balancer Controller (ALB) for ingress.
   ```bash
   kubectl apply -k github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master
   helm repo add eks https://aws.github.io/eks-charts
   helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
     --namespace kube-system \
     --set clusterName=chatbot-cluster \
     --set serviceAccount.create=false \
     --set serviceAccount.name=aws-load-balancer-controller
   ```
2. Ensure the controller’s IAM role includes permissions per AWS docs (can be created via eksctl or AWS console).

3. (Optional) Install metrics-server and cluster autoscaler for HPA support.

---

## 5. Kubernetes manifests

Create a `k8s/` directory in the repo with the following files.

### 5.1 Namespace & secrets
`k8s/namespace.yaml`
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: chatbot
```

`k8s/secrets.yaml`
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: chatbot-secrets
  namespace: chatbot
type: Opaque
stringData:
  DATABASE_URL: postgres://user:pass@host:5432/chatbot
  WHATSAPP_VERIFY_TOKEN: ...
  WABA_TOKEN: ...
  PHONE_NUMBER_ID: ...
  ADMIN_API_KEYS: ...
  OWNER_JWT_SECRET: ...
  OPENAI_API_KEY: ...
  APP_SECRET: ...
```
> Replace with actual values or use `kubectl create secret ... --from-literal` per environment. For production, prefer pulling from AWS Secrets Manager via External Secrets Operator.

### 5.2 ConfigMap (optional)
`k8s/configmap.yaml`
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: chatbot-config
  namespace: chatbot
data:
  PORT: "3000"
  OPENAI_MODEL: gpt-4.1-mini
  PENDING_RETENTION_HOURS: "48"
  APPOINTMENT_RETENTION_DAYS: "730"
  CUSTOMER_RETENTION_DAYS: "365"
```

### 5.3 Deployment & Service
`k8s/deployment.yaml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chatbot-api
  namespace: chatbot
spec:
  replicas: 2
  selector:
    matchLabels:
      app: chatbot-api
  template:
    metadata:
      labels:
        app: chatbot-api
    spec:
      containers:
        - name: api
          image: <account>.dkr.ecr.<region>.amazonaws.com/chatbot-app:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: chatbot-secrets
            - configMapRef:
                name: chatbot-config
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 15
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 30
```

`k8s/service.yaml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: chatbot-api
  namespace: chatbot
spec:
  type: ClusterIP
  selector:
    app: chatbot-api
  ports:
    - port: 80
      targetPort: 3000
```

### 5.4 Ingress (ALB)
`k8s/ingress.yaml`
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: chatbot-api
  namespace: chatbot
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:<region>:<account>:certificate/<id>
spec:
  rules:
    - host: api.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: chatbot-api
                port:
                  number: 80
```
> Replace host and ACM certificate ARN. If you don’t have a domain/cert, start with HTTP-only ingress.

### 5.5 CronJob for retention
`k8s/retention-cronjob.yaml`
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: chatbot-retention
  namespace: chatbot
spec:
  schedule: "0 2 * * *"  # daily at 02:00 UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: retention
              image: <account>.dkr.ecr.<region>.amazonaws.com/chatbot-app:latest
              command: ["npm","run","retention:prune"]
              envFrom:
                - secretRef:
                    name: chatbot-secrets
                - configMapRef:
                    name: chatbot-config
          restartPolicy: OnFailure
```

### 5.6 Apply manifests
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml    # or kubectl create secret ...
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/retention-cronjob.yaml
```

---

## 6. CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:
```yaml
name: CI/CD

on:
  push:
    branches: [ main, feature/roadmap-plan ]

jobs:
  build-test-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm test
      - run: npm run admin:build
      - run: npm run owner:build
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: <region>
      - name: Login to ECR
        run: |
          aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
      - name: Build & push image
        run: |
          docker build -t chatbot-app:${{ github.sha }} .
          docker tag chatbot-app:${{ github.sha }} <account>.dkr.ecr.<region>.amazonaws.com/chatbot-app:${{ github.sha }}
          docker push <account>.dkr.ecr.<region>.amazonaws.com/chatbot-app:${{ github.sha }}
      - name: Update K8s manifests
        run: |
          sed -i "s|chatbot-app:latest|chatbot-app:${{ github.sha }}|g" k8s/deployment.yaml k8s/retention-cronjob.yaml
      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name chatbot-cluster --region <region>
      - name: Deploy to EKS
        run: kubectl apply -f k8s/
```

**GitHub Secrets required:**
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` with permissions for ECR push and EKS deploy.
- (Optional) `DOCKERHUB_USERNAME/PASSWORD` if pushing elsewhere.

**Notes:**
- Use Kustomize/Helm for cleaner image tag updates instead of `sed` if preferred.
- Split the workflow into build/test vs deploy jobs if you want manual approvals.

---

## 7. DNS & HTTPS configuration

1. **ACM certificate**: Request a public certificate for `api.yourdomain.com` in the same region as the ALB (typically us-east-1).
2. **Route53 record**: Once ingress creates an ALB, note its DNS name and create an `A`/`CNAME` record pointing your domain/subdomain to it.
3. Update WhatsApp webhook configuration in Meta Developer console with the new HTTPS URL.

---

## 8. Secrets & rotation strategy

1. Use AWS Secrets Manager or SSM Parameter Store to store WhatsApp tokens, OpenAI keys, `ADMIN_API_KEYS`, `OWNER_JWT_SECRET`, and the Postgres credentials.
2. Integrate with Kubernetes:
   - Deploy AWS Secrets & Configuration Provider (ASCP) or External Secrets Operator to sync secrets into Kubernetes as native secrets.
   - Update the Deployment to reference those synced secrets.
3. Document rotation steps in `docs/security-and-compliance.md`; use AWS Lambda or scheduled jobs to rotate tokens if needed.

---

## 9. Observability & operations

1. Enable CloudWatch Container Insights or Prometheus/Grafana for metrics.
2. Aggregate logs (CloudWatch Logs via fluent-bit or AWS for Fluent Bit).
3. Set CloudWatch alarms for:
   - High 5xx rate on ALB.
   - RDS CPU/storage thresholds.
   - CronJob failures.
4. Define runbooks for tenant onboarding, incident response, and retention disputes.

---

## 10. Go-live checklist

- [ ] RDS instance reachable from EKS; migrations applied (`initializeDatabase()` runs automatically on startup).
- [ ] Kubernetes Deployment healthy (replicas running).
- [ ] Ingress/ALB reachable via HTTPS + domain.
- [ ] Secrets loaded correctly (app boots without env validation errors).
- [ ] Admin/owner portals accessible and functional.
- [ ] WhatsApp webhook updated to new URL; Meta verifies challenge.
- [ ] CI/CD workflow green on latest commit.
- [ ] Monitoring/alerts configured.
- [ ] Documentation (system overview, security guide, onboarding steps) shared with the team.

Once all boxes are checked, you’re ready to onboard the first tenant confidently. Keep iterating on the roadmap items (secret management automation, compliance policies, admin UX polish) as you gather feedback from live tenants.
