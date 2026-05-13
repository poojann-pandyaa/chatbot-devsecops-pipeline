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
