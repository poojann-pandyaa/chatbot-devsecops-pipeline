pipeline {
    agent any

    environment {
        DOCKERHUB_USER          = 'poojannpandyaa'
        BACKEND_IMAGE           = "${DOCKERHUB_USER}/chatbot-backend"
        FRONTEND_IMAGE          = "${DOCKERHUB_USER}/chatbot-frontend"
        IMAGE_TAG               = "${BUILD_NUMBER}"
        ANSIBLE_VAULT_PASS_FILE = credentials('ansible-vault-pass')
        PATH                    = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${env.PATH}"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Backend Image') {
            steps {
                sh "docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} ./backend"
            }
        }

        stage('Build Frontend Image') {
            steps {
                sh "docker build -t ${FRONTEND_IMAGE}:${IMAGE_TAG} ./app"
            }
        }

        stage('Security Scan') {
            steps {
                sh '''
#!/bin/bash
set -e

SEP="########################################################################"
DIV="------------------------------------------------------------------------"

echo ""
echo "$SEP"
echo "#                                                                      #"
echo "#            TRIVY CONTAINER SECURITY SCAN REPORT                     #"
echo "#            Build : ${BUILD_NUMBER}                                  #"
echo "#                                                                      #"
echo "$SEP"
echo ""

# =====================================================================
# BACKEND SCAN
# =====================================================================
echo "$DIV"
echo "  [1/2] SCANNING BACKEND IMAGE"
echo "  Image: ${BACKEND_IMAGE}:${IMAGE_TAG}"
echo "$DIV"

trivy image \
    --exit-code 0 \
    --severity HIGH,CRITICAL \
    --no-progress \
    --format table \
    ${BACKEND_IMAGE}:${IMAGE_TAG} 2>/dev/null > /tmp/be_full.txt || true

# Extract just the vulnerability detail lines (skip OS/pkg headers)
grep -E "^[|]" /tmp/be_full.txt | \
    grep -E "(HIGH|CRITICAL)" > /tmp/be_cves.txt || true

B_CRIT=$(grep -c "CRITICAL" /tmp/be_cves.txt 2>/dev/null || echo 0)
B_HIGH=$(grep -c "HIGH"     /tmp/be_cves.txt 2>/dev/null || echo 0)

if [ -s /tmp/be_cves.txt ]; then
    echo ""
    echo "  CVE-ID              SEVERITY   PACKAGE          INSTALLED    FIXED       "
    echo "  ------------------  ---------  ---------------  -----------  -----------"
    while IFS= read -r line; do
        # Pull columns from the trivy table row
        CVE=$(echo    "$line" | awk -F"|" "{print \$2}" | xargs)
        SEV=$(echo    "$line" | awk -F"|" "{print \$3}" | xargs)
        PKG=$(echo    "$line" | awk -F"|" "{print \$1}" | xargs)
        INST=$(echo   "$line" | awk -F"|" "{print \$5}" | xargs)
        FIXED=$(echo  "$line" | awk -F"|" "{print \$6}" | xargs)
        printf "  %-20s  %-9s  %-15s  %-11s  %-11s\n" \
               "$CVE" "$SEV" "$PKG" "$INST" "$FIXED"
    done < /tmp/be_cves.txt
else
    echo ""
    echo "  >> No HIGH or CRITICAL vulnerabilities found in backend image."
fi

echo ""
echo "  BACKEND TOTALS:  CRITICAL = $B_CRIT   HIGH = $B_HIGH"
echo ""

# =====================================================================
# FRONTEND SCAN
# =====================================================================
echo "$DIV"
echo "  [2/2] SCANNING FRONTEND IMAGE"
echo "  Image: ${FRONTEND_IMAGE}:${IMAGE_TAG}"
echo "$DIV"

trivy image \
    --exit-code 0 \
    --severity HIGH,CRITICAL \
    --no-progress \
    --format table \
    ${FRONTEND_IMAGE}:${IMAGE_TAG} 2>/dev/null > /tmp/fe_full.txt || true

grep -E "^[|]" /tmp/fe_full.txt | \
    grep -E "(HIGH|CRITICAL)" > /tmp/fe_cves.txt || true

F_CRIT=$(grep -c "CRITICAL" /tmp/fe_cves.txt 2>/dev/null || echo 0)
F_HIGH=$(grep -c "HIGH"     /tmp/fe_cves.txt 2>/dev/null || echo 0)

if [ -s /tmp/fe_cves.txt ]; then
    echo ""
    echo "  CVE-ID              SEVERITY   PACKAGE          INSTALLED    FIXED       "
    echo "  ------------------  ---------  ---------------  -----------  -----------"
    # Show top 30 to keep output readable
    head -30 /tmp/fe_cves.txt | while IFS= read -r line; do
        CVE=$(echo    "$line" | awk -F"|" "{print \$2}" | xargs)
        SEV=$(echo    "$line" | awk -F"|" "{print \$3}" | xargs)
        PKG=$(echo    "$line" | awk -F"|" "{print \$1}" | xargs)
        INST=$(echo   "$line" | awk -F"|" "{print \$5}" | xargs)
        FIXED=$(echo  "$line" | awk -F"|" "{print \$6}" | xargs)
        printf "  %-20s  %-9s  %-15s  %-11s  %-11s\n" \
               "$CVE" "$SEV" "$PKG" "$INST" "$FIXED"
    done
    TOTAL_FE=$(wc -l < /tmp/fe_cves.txt)
    if [ "$TOTAL_FE" -gt 30 ]; then
        echo "  ... ($((TOTAL_FE - 30)) more CVEs hidden - run trivy locally to see all)"
    fi
else
    echo ""
    echo "  >> No HIGH or CRITICAL vulnerabilities found in frontend image."
fi

echo ""
echo "  FRONTEND TOTALS:  CRITICAL = $F_CRIT   HIGH = $F_HIGH"
echo ""

# =====================================================================
# FINAL SUMMARY
# =====================================================================
TOT_CRIT=$((B_CRIT + F_CRIT))
TOT_HIGH=$((B_HIGH + F_HIGH))
TOTAL=$((TOT_CRIT + TOT_HIGH))

echo "$SEP"
echo "#                    SCAN SUMMARY                                      #"
echo "$SEP"
echo ""
printf "  %-12s  %8s  %8s  %8s\n" "IMAGE"     "CRITICAL" "HIGH" "TOTAL"
printf "  %-12s  %8s  %8s  %8s\n" "------------" "--------" "--------" "--------"
printf "  %-12s  %8s  %8s  %8s\n" "backend"   "$B_CRIT"  "$B_HIGH"  "$((B_CRIT+B_HIGH))"
printf "  %-12s  %8s  %8s  %8s\n" "frontend"  "$F_CRIT"  "$F_HIGH"  "$((F_CRIT+F_HIGH))"
printf "  %-12s  %8s  %8s  %8s\n" "------------" "--------" "--------" "--------"
printf "  %-12s  %8s  %8s  %8s\n" "TOTAL"     "$TOT_CRIT" "$TOT_HIGH" "$TOTAL"
echo ""

if [ "$TOT_CRIT" -gt 0 ]; then
    echo "  STATUS  >>  WARNING: $TOT_CRIT CRITICAL CVE(s) found. Review before shipping."
else
    echo "  STATUS  >>  PASSED : Zero CRITICAL vulnerabilities. Safe to push."
fi
echo ""
echo "$SEP"
echo ""
                '''
            }
        }

        stage('Push Images') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                    '''
                }
            }
        }

        stage('Deploy via Ansible') {
            steps {
                sh '''
                    ansible-playbook ansible/site.yml \
                        --vault-password-file ${ANSIBLE_VAULT_PASS_FILE} \
                        -e "backend_image=${BACKEND_IMAGE}:${IMAGE_TAG}" \
                        -e "frontend_image=${FRONTEND_IMAGE}:${IMAGE_TAG}" \
                        -i ansible/inventory/hosts.ini
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    sleep 15
                    kubectl get pods -n chatbot-prod
                    kubectl rollout status deployment/chatbot-backend -n chatbot-prod --timeout=120s
                '''
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully.'
        }
        failure {
            echo 'Pipeline failed. Check logs above.'
        }
    }
}
