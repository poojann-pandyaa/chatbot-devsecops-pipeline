pipeline {
    agent any
    environment {
        PATH      = "/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/homebrew/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        JAVA_HOME = "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
        IMAGE_NAME   = "poojannpandyaa/chatbot"
        K8S_NAMESPACE = "chatbot-prod"
    }
    stages {
        stage('Checkout SCM') {
            steps {
                checkout scm
                script {
                    env.IMAGE_TAG = sh(script: 'git rev-parse --short=7 HEAD', returnStdout: true).trim()
                }
            }
        }
        stage('Install Dependencies') {
            steps {
                sh 'cd app && npm install'
            }
        }
        stage('SonarQube Analysis') {
            steps {
                echo 'SonarQube analysis skipped – server not available in local environment'
            }
        }
        stage('Quality Gate') {
            steps {
                echo 'Quality gate skipped – SonarQube not available in local environment'
            }
        }
        stage('OWASP FS SCAN') {
            steps {
                echo 'OWASP dependency-check skipped – NVD API key pending activation'
            }
        }
        stage('TRIVY FS SCAN') {
            steps {
                sh 'trivy fs . --exit-code 0 --severity HIGH,CRITICAL --format table -o trivyfs.txt || true'
                sh 'cat trivyfs.txt'
            }
        }
        stage('Docker Build & Push') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'docker', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin https://index.docker.io/v1/
                        docker buildx build \
                          --platform linux/arm64 \
                          -t ${IMAGE_NAME}:${IMAGE_TAG} \
                          -t ${IMAGE_NAME}:latest \
                          --push app/
                        docker logout
                    '''
                }
            }
        }
        stage('TRIVY Image SCAN') {
            steps {
                sh 'trivy image ${IMAGE_NAME}:${IMAGE_TAG} --exit-code 0 --severity HIGH,CRITICAL --format table -o trivyimage.txt || true'
                sh 'cat trivyimage.txt'
            }
        }
        stage('Remove Container') {
            steps {
                sh 'docker stop chatbot || true && docker rm chatbot || true'
            }
        }
        stage('Deploy to Container') {
            steps {
                sh 'docker run -d --name chatbot -p 3000:3000 ${IMAGE_NAME}:${IMAGE_TAG}'
            }
        }
        stage('Ansible Deploy') {
            steps {
                sh '''
                    ansible-playbook -i ansible/inventory/hosts.ini ansible/site.yml \
                      --extra-vars "image_tag=${IMAGE_TAG} git_commit=${GIT_COMMIT} namespace=${K8S_NAMESPACE}"
                '''
            }
        }
    }
}
