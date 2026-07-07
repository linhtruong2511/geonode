import os
import sys
import django

# Add the src directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.dirname(current_dir)
sys.path.append(src_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'geonode_project.settings')
django.setup()

from django.db import connection

def create_partitions():
    print("Creating partitions for wind_observations...")
    with connection.cursor() as cursor:
        # Check if table is already partitioned
        cursor.execute("""
            SELECT relkind 
            FROM pg_class 
            WHERE relname = 'wind_observations';
        """)
        row = cursor.fetchone()
        
        if row and row[0] == 'p':
            print("Table wind_observations is already partitioned.")
            # Still make sure partitions exist
        else:
            # Drop the normal table created by Django's makemigrations
            print("Dropping normal table wind_observations...")
            cursor.execute("DROP TABLE IF EXISTS wind_observations CASCADE;")
            
            print("Recreating wind_observations as partitioned table...")
            cursor.execute("""
                CREATE TABLE wind_observations (
                    id BIGSERIAL,
                    station_id INTEGER NOT NULL REFERENCES wind_stations(id) ON DELETE CASCADE,
                    obs_time TIMESTAMP NOT NULL,
                    rain_06h NUMERIC(6,2),
                    rain_24h NUMERIC(6,2),
                    temp_2m NUMERIC(5,2),
                    temp_min NUMERIC(5,2),
                    temp_max NUMERIC(5,2),
                    humidity NUMERIC(5,2),
                    pressure NUMERIC(6,2),
                    wind_dir NUMERIC(5,1),
                    wind_speed NUMERIC(5,2),
                    PRIMARY KEY (id, obs_time)
                ) PARTITION BY RANGE (obs_time);
            """)
        
        # Create partitions for 1990 - 2030
        for year in range(1990, 2031):
            partition_name = f"wind_observations_{year}"
            print(f"Ensuring partition {partition_name} exists...")
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS {partition_name} 
                PARTITION OF wind_observations 
                FOR VALUES FROM ('{year}-01-01') TO ('{year+1}-01-01');
            """)
            
        # Recreate indexes defined in models.py
        print("Recreating indexes...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS wind_observ_station_56b774_idx 
            ON wind_observations (station_id, obs_time);
        """)
        
        print("Done!")

if __name__ == "__main__":
    create_partitions()
