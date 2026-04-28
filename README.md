# 🏴‍☠️ One Piece Kubernetes TP

> Plateforme microservices thème One Piece — déployable sur Kubernetes avec GitOps

## 📐 Architecture

```
                        ┌─────────────────────────────────────┐
                        │           Kong API Gateway           │
                        │        (onepiece-gateway ns)         │
                        └─────────────────┬───────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
          ┌─────────▼────────┐  ┌─────────▼────────┐  ┌────────▼─────────┐
          │  crew-service    │  │character-service  │  │devil-fruit-svc   │
          │  :3001 (x2 pods) │  │  :3002 (x2 pods) │  │  :3003 (x2 pods) │
          └─────────┬────────┘  └─────────┬─────────┘  └──────────────────┘
                    │                     │
          ┌─────────▼────────┐  ┌─────────▼────────┐
          │  ship-service    │  │ battle-service    │
          │  :3004 (x2 pods) │  │  :3005 (x2 pods) │
          └─────────┬────────┘  └──────────────────┘
                    │
          ┌─────────▼─────────────────────────────────┐
          │              Databases (onepiece ns)        │
          │  ┌─────────────────┐  ┌─────────────────┐  │
          │  │  PostgreSQL 16  │  │    Redis 7       │  │
          │  │  (StatefulSet)  │  │  (StatefulSet)   │  │
          │  │  PVC: 5Gi       │  │  PVC: 1Gi        │  │
          │  └─────────────────┘  └─────────────────┘  │
          └───────────────────────────────────────────┘
                    │
          ┌─────────▼───────────────────────────────────┐
          │         Monitoring (onepiece-monitoring ns)  │
          │   Prometheus + Grafana + AlertManager        │
          └──────────────────────────────────────────────┘
```

## 🗂️ Services

| Service | Port | DB | Cache | Description |
|---|---|---|---|---|
| crew-service | 3001 | ✅ PostgreSQL | ✅ Redis | Gestion des équipages |
| character-service | 3002 | ✅ PostgreSQL | ✅ Redis | Gestion des personnages |
| devil-fruit-service | 3003 | ✅ PostgreSQL | ✅ Redis | Gestion des Fruits du Démon |
| ship-service | 3004 | ✅ PostgreSQL | ❌ | Gestion des bateaux |
| battle-service | 3005 | ❌ | ✅ Redis | Simulation de combats |

## 🚀 Démarrage rapide (Local avec Docker Compose)

```bash
# 1. Cloner le repo
git clone https://github.com/YOUR_USERNAME/onepiece-k8s.git
cd onepiece-k8s

# 2. Lancer tous les services
docker compose up --build

# 3. Tester
curl http://localhost:3001/api/crews
curl http://localhost:3002/api/characters
curl http://localhost:3003/api/devil-fruits
curl http://localhost:3004/api/ships
curl http://localhost:3005/api/battles/leaderboard

# Simuler un combat !
curl -X POST http://localhost:3005/api/battles/fight \
  -H "Content-Type: application/json" \
  -d '{"attacker_id": 1, "defender_id": 10}'
```

## ☸️ Déploiement Kubernetes (Minikube — 100% gratuit)

### Prérequis

```bash
# Installer minikube
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# Installer kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/kubectl

# Installer helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Step 1 — Démarrer Minikube

```bash
minikube start --cpus=4 --memory=6g --driver=docker
minikube addons enable ingress
minikube addons enable metrics-server
eval $(minikube docker-env)   # build images directement dans minikube
```

### Step 2 — Build des images

```bash
# Build toutes les images dans le registry de minikube
docker build -t onepiece/crew-service:latest       ./services/crew-service
docker build -t onepiece/character-service:latest  ./services/character-service
docker build -t onepiece/devil-fruit-service:latest ./services/devil-fruit-service
docker build -t onepiece/ship-service:latest       ./services/ship-service
docker build -t onepiece/battle-service:latest     ./services/battle-service
```

### Step 3 — Déployer sur Kubernetes

```bash
# Namespaces
kubectl apply -f k8s/namespaces/namespaces.yaml

# Databases (StatefulSets + PVCs)
kubectl apply -f k8s/databases/postgres.yaml
kubectl apply -f k8s/databases/redis.yaml

# Attendre que les BDD soient prêtes
kubectl wait --for=condition=ready pod -l app=postgres -n onepiece --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis   -n onepiece --timeout=60s

# Microservices
kubectl apply -f k8s/crew/
kubectl apply -f k8s/character/
kubectl apply -f k8s/devil-fruit/
kubectl apply -f k8s/ship/
kubectl apply -f k8s/battle/

# Gateway (Kong via Helm)
helm repo add kong https://charts.konghq.com
helm repo update
helm install kong kong/kong --namespace onepiece-gateway --create-namespace

# Ingress rules
kubectl apply -f k8s/gateway/kong-ingress.yaml

# Monitoring
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace onepiece-monitoring --create-namespace \
  --values k8s/monitoring/prometheus-values.yaml
```

### Step 4 — Accéder aux services

```bash
# Récupérer l'URL de l'ingress
minikube ip   # ex: 192.168.49.2

# Ajouter au /etc/hosts
echo "$(minikube ip) onepiece.local" | sudo tee -a /etc/hosts

# Tester via l'API Gateway
curl http://onepiece.local/api/crews
curl http://onepiece.local/api/characters
curl http://onepiece.local/api/devil-fruits

# Grafana
kubectl port-forward svc/monitoring-grafana 3000:80 -n onepiece-monitoring
# → http://localhost:3000 (admin / grandline123)
```

### Step 5 — GitOps avec ArgoCD (Bonus)

```bash
# Installer ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Accéder à l'UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Mot de passe initial:
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Déployer l'app GitOps (mettre à jour le repoURL dans argocd/app.yaml d'abord)
kubectl apply -f argocd/app.yaml
```

### Step 6 — GitOps avec Terraform (Bonus avancé)

```bash
cd terraform
terraform init
terraform plan -var="db_password=grandline"
terraform apply -var="db_password=grandline" -auto-approve
```

## 📡 API Reference

### Crew Service — `GET /api/crews`
```json
{
  "data": [
    { "id": 1, "name": "Straw Hat Pirates", "bounty_total": 3161000100, "member_count": 9 }
  ]
}
```

### Battle Service — `POST /api/battles/fight`
```json
// Request
{ "attacker_id": 1, "defender_id": 10 }

// Response
{
  "message": "⚔️ Monkey D. Luffy VS Trafalgar Law — Winner: Monkey D. Luffy!",
  "battle": {
    "winner_name": "Monkey D. Luffy",
    "technique_used": "Gear Fourth",
    "location": "Marineford",
    "damage_dealt": 7423
  },
  "play_by_play": [
    "Monkey D. Luffy challenges Trafalgar Law at Marineford!",
    "Monkey D. Luffy uses Gear Fourth!",
    "Monkey D. Luffy wins with 7423 damage after 42.1s!"
  ]
}
```

### Crew War — `POST /api/battles/crew-war`
```json
// Request
{ "crew1_id": 1, "crew2_id": 5 }
```

## 📊 Kubernetes Resources Overview

| Resource | Count | Details |
|---|---|---|
| Namespaces | 3 | onepiece, onepiece-monitoring, onepiece-gateway |
| Pods | 10+ | 2 replicas × 5 services |
| StatefulSets | 2 | PostgreSQL + Redis |
| PVCs | 2 | postgres:5Gi, redis:1Gi |
| Services | 7 | 5 microservices + postgres + redis |
| HPAs | 5 | Auto-scale 2→5 replicas on CPU/Memory |
| ConfigMaps | 8 | One per service + databases |
| Secrets | 1 | postgres-secret |
| Ingress | 1 | Kong with rate-limiting + CORS |
| NetworkPolicy | 1 | Restrict inter-namespace traffic |

## 🎓 Points importants pour la présentation

1. **Namespace isolation** — 3 namespaces séparés (app / monitoring / gateway)
2. **StatefulSets** avec PVCs pour les données persistantes (PostgreSQL + Redis)
3. **HPA** — auto-scaling horizontal sur CPU et mémoire
4. **Service mesh-light** — communication inter-services via ClusterIP
5. **NetworkPolicy** — isolation réseau entre namespaces
6. **ConfigMaps + Secrets** — séparation config/secrets
7. **Health probes** — readiness + liveness sur chaque pod
8. **Monitoring** — Prometheus + Grafana avec ServiceMonitor auto-discovery
9. **GitOps** — ArgoCD sync automatique depuis Git
10. **IaC** — Terraform pour provisionner l'infrastructure K8s

## 🆓 Stack 100% gratuite

| Outil | Alternative payante | Pourquoi gratuit |
|---|---|---|
| Minikube | EKS/GKE/AKS | Local Kubernetes |
| Kong Community | Kong Enterprise / Apigee | Open Source |
| ArgoCD | Flux CD | Open Source CNCF |
| Prometheus + Grafana | Datadog | Open Source |
| Terraform | Pulumi Cloud | CLI open source |
| PostgreSQL + Redis | RDS + ElastiCache | Self-hosted |

> **Note sur Apigee** : Apigee ne propose plus de free trial réel depuis 2023. Kong est l'alternative open source parfaite qui offre les mêmes fonctionnalités (rate limiting, auth, CORS, plugins) sans frais.
